package inventory

import (
	"context"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// The "get-vanilla" case of AWS's SigV4 test suite.
func TestSignV4Vanilla(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "https://example.amazonaws.com/", nil)
	now := time.Date(2015, 8, 30, 12, 36, 0, 0, time.UTC)
	signV4(req, "AKIDEXAMPLE", "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "", "us-east-1", "service", now)
	want := "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31"
	if got := req.Header.Get("Authorization"); got != want {
		t.Fatalf("Authorization\n got %s\nwant %s", got, want)
	}
}

const ec2XML = `<?xml version="1.0" encoding="UTF-8"?>
<DescribeInstancesResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/">
  <reservationSet>
    <item><instancesSet>
      <item>
        <instanceId>i-1</instanceId><instanceState><name>running</name></instanceState>
        <privateIpAddress>10.0.0.5</privateIpAddress><ipAddress>3.3.3.3</ipAddress>
        <tagSet><item><key>Name</key><value>web-1</value></item></tagSet>
      </item>
      <item>
        <instanceId>i-2</instanceId><instanceState><name>stopped</name></instanceState>
        <privateIpAddress>10.0.0.6</privateIpAddress><platform>windows</platform>
      </item>
      <item>
        <instanceId>i-3</instanceId><instanceState><name>terminated</name></instanceState>
      </item>
    </instancesSet></item>
  </reservationSet>
</DescribeInstancesResponse>`

func TestFetchAWS(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "AWS4-HMAC-SHA256 Credential=AKID/") || r.URL.Query().Get("Action") != "DescribeInstances" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		_, _ = w.Write([]byte(ec2XML))
	}))
	defer srv.Close()
	old := ec2Endpoint
	ec2Endpoint = func(string) string { return srv.URL + "/" }
	defer func() { ec2Endpoint = old }()

	cfg := Config{AccessKeyID: "AKID", Regions: []string{"eu-central-1"}}
	list, err := Fetch(context.Background(), KindAWS, cfg, "secret")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("got %d instances, want 2 (terminated skipped): %+v", len(list), list)
	}
	if list[0].Name != "web-1" || list[0].Address != "10.0.0.5" || !list[0].Running || list[0].ExternalID != "eu-central-1/i-1" {
		t.Errorf("first = %+v", list[0])
	}
	if list[1].Name != "i-2" || !list[1].Windows || list[1].Running {
		t.Errorf("second = %+v", list[1])
	}
	cfg.Address, cfg.RunningOnly = "public", true
	list, _ = Fetch(context.Background(), KindAWS, cfg, "secret")
	if len(list) != 1 || list[0].Address != "3.3.3.3" {
		t.Errorf("public + running only = %+v", list)
	}
	if _, err := Fetch(context.Background(), KindAWS, Config{AccessKeyID: "AKID", Regions: []string{"x;rm"}}, "s"); err == nil {
		t.Error("invalid region accepted")
	}
}

func TestFetchProxmox(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "PVEAPIToken=root@pam!t=sec" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch r.URL.Path {
		case "/api2/json/cluster/resources":
			_, _ = w.Write([]byte(`{"data":[
				{"id":"qemu/100","vmid":100,"name":"db","node":"pve1","status":"running","type":"qemu"},
				{"id":"lxc/101","vmid":101,"name":"ct","node":"pve1","status":"stopped","type":"lxc"},
				{"id":"qemu/9000","vmid":9000,"name":"tpl","node":"pve1","status":"stopped","type":"qemu","template":1},
				{"id":"storage/x","type":"storage"}]}`))
		case "/api2/json/nodes/pve1/qemu/100/config":
			_, _ = w.Write([]byte(`{"data":{"ostype":"win11"}}`))
		case "/api2/json/nodes/pve1/qemu/100/agent/network-get-interfaces":
			_, _ = w.Write([]byte(`{"data":{"result":[{"name":"lo","ip-addresses":[{"ip-address":"127.0.0.1","ip-address-type":"ipv4"}]},
				{"name":"eth0","ip-addresses":[{"ip-address":"fe80::1","ip-address-type":"ipv6"},{"ip-address":"192.168.1.10","ip-address-type":"ipv4"}]}]}}`))
		case "/api2/json/nodes/pve1/lxc/101/config":
			_, _ = w.Write([]byte(`{"data":{"ostype":"debian","net0":"name=eth0,bridge=vmbr0,ip=192.168.1.11/24"}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	cfg := Config{URL: srv.URL, TokenID: "root@pam!t"}
	_, err := Fetch(context.Background(), KindProxmox, cfg, "sec")
	var ce *CertError
	if !errors.As(err, &ce) || !strings.HasPrefix(err.Error(), CertPrefix+"|") {
		t.Fatalf("self-signed server: err = %v, want CertError", err)
	}
	sum := sha256.Sum256(srv.Certificate().Raw)
	if ce.Fingerprint != hex.EncodeToString(sum[:]) {
		t.Fatalf("fingerprint %s", ce.Fingerprint)
	}

	cfg.Fingerprint = ce.Fingerprint
	list, err := Fetch(context.Background(), KindProxmox, cfg, "sec")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("got %+v", list)
	}
	byID := map[string]Instance{}
	for _, in := range list {
		byID[in.ExternalID] = in
	}
	if db := byID["qemu/100"]; db.Address != "192.168.1.10" || !db.Windows || !db.Running {
		t.Errorf("db = %+v", db)
	}
	if ct := byID["lxc/101"]; ct.Address != "192.168.1.11" || ct.Windows || ct.Running {
		t.Errorf("ct = %+v", ct)
	}
	if _, err := Fetch(context.Background(), KindProxmox, cfg, "wrong"); err == nil || !strings.Contains(err.Error(), "token") {
		t.Errorf("wrong secret: %v", err)
	}
}

func TestProxmoxCertificateNeedsMatchingIPOrFingerprint(t *testing.T) {
	srv := httptest.NewTLSServer(http.NotFoundHandler())
	defer srv.Close()
	leaf := srv.Certificate()
	chain := []*x509.Certificate{leaf}
	roots := x509.NewCertPool()
	roots.AddCert(leaf)
	if err := verifyProxmoxCertificate("127.0.0.1", "", chain, roots); err != nil {
		t.Fatalf("trusted certificate for the destination IP was refused: %v", err)
	}
	for _, host := range []string{"192.0.2.1", ""} {
		if err := verifyProxmoxCertificate(host, "", chain, roots); err == nil {
			t.Fatalf("trusted certificate for a different destination accepted for %q", host)
		}
	}
	if err := verifyProxmoxCertificate("127.0.0.1", strings.Repeat("00", 32), chain, roots); err == nil {
		t.Fatal("a different certificate was accepted despite an existing fingerprint")
	}
}
