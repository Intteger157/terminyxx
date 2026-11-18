package inventory

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
)

type pveResource struct {
	ID       string `json:"id"`
	VMID     int    `json:"vmid"`
	Name     string `json:"name"`
	Node     string `json:"node"`
	Status   string `json:"status"`
	Type     string `json:"type"` // qemu | lxc
	Template int    `json:"template"`
}

type pveClient struct {
	base   string
	auth   string
	client *http.Client
}

func (c *pveClient) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/api2/json"+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", c.auth)
	resp, err := c.client.Do(req)
	if err != nil {
		return certError(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("Proxmox refused the API token (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Proxmox: HTTP %d", resp.StatusCode)
	}
	var env struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		return err
	}
	return json.Unmarshal(env.Data, out)
}

func fetchProxmox(ctx context.Context, cfg Config, secret string) ([]Instance, error) {
	base := strings.TrimRight(strings.TrimSpace(cfg.URL), "/")
	u, err := url.Parse(base)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return nil, errors.New("the Proxmox URL must look like https://host:8006")
	}
	if cfg.TokenID == "" || secret == "" || !strings.Contains(cfg.TokenID, "!") {
		return nil, errors.New("an API token ID (user@realm!name) and its secret are required")
	}
	c := &pveClient{base: base, auth: "PVEAPIToken=" + strings.TrimSpace(cfg.TokenID) + "=" + strings.TrimSpace(secret), client: pinnedClient(cfg.Fingerprint)}

	var res []pveResource
	if err := c.get(ctx, "/cluster/resources?type=vm", &res); err != nil {
		return nil, err
	}

	out := make([]Instance, 0, len(res))
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	for _, r := range res {
		if r.Template == 1 || (r.Type != "qemu" && r.Type != "lxc") {
			continue
		}
		wg.Add(1)
		go func(r pveResource) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			in := Instance{
				ExternalID: fmt.Sprintf("%s/%d", r.Type, r.VMID),
				Name:       r.Name,
				Running:    r.Status == "running",
				Group:      r.Node,
				Tags:       []string{"proxmox", r.Node},
			}
			if in.Name == "" {
				in.Name = fmt.Sprintf("%s %d", r.Type, r.VMID)
			}
			in.Address, in.Windows = c.details(ctx, r)
			mu.Lock()
			out = append(out, in)
			mu.Unlock()
		}(r)
	}
	wg.Wait()
	return out, nil
}

// details finds a machine's IPv4 address (the guest agent for VMs, the
// container's interfaces for LXC, else a static address from the config)
// and whether it runs Windows. Failures just leave the address empty.
func (c *pveClient) details(ctx context.Context, r pveResource) (string, bool) {
	base := fmt.Sprintf("/nodes/%s/%s/%d", url.PathEscape(r.Node), r.Type, r.VMID)
	var conf map[string]any
	_ = c.get(ctx, base+"/config", &conf)
	ostype, _ := conf["ostype"].(string)
	windows := strings.HasPrefix(ostype, "w")
	if r.Status == "running" {
		if r.Type == "qemu" {
			var agent struct {
				Result []struct {
					Name string `json:"name"`
					IPs  []struct {
						Addr string `json:"ip-address"`
						Type string `json:"ip-address-type"`
					} `json:"ip-addresses"`
				} `json:"result"`
			}
			if c.get(ctx, base+"/agent/network-get-interfaces", &agent) == nil {
				for _, iface := range agent.Result {
					for _, ip := range iface.IPs {
						if ip.Type == "ipv4" && usableIP(ip.Addr) {
							return ip.Addr, windows
						}
					}
				}
			}
		} else {
			var ifaces []struct {
				Name string `json:"name"`
				Inet string `json:"inet"`
			}
			if c.get(ctx, base+"/interfaces", &ifaces) == nil {
				for _, i := range ifaces {
					ip, _, _ := strings.Cut(i.Inet, "/")
					if usableIP(ip) {
						return ip, windows
					}
				}
			}
		}
	}
	// Static addresses: LXC "net0: name=eth0,...,ip=10.0.0.5/24",
	// cloud-init "ipconfig0: ip=10.0.0.5/24,gw=...".
	for _, key := range []string{"net0", "ipconfig0", "net1", "ipconfig1"} {
		v, _ := conf[key].(string)
		for _, part := range strings.Split(v, ",") {
			if ip, ok := strings.CutPrefix(part, "ip="); ok {
				ip, _, _ = strings.Cut(ip, "/")
				if usableIP(ip) {
					return ip, windows
				}
			}
		}
	}
	return "", windows
}
