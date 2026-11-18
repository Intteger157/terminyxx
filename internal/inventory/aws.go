package inventory

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// ec2Endpoint is replaced in tests.
var ec2Endpoint = func(region string) string { return "https://ec2." + region + ".amazonaws.com/" }

var regionRe = regexp.MustCompile(`^[a-z]{2}(-[a-z]+)+-\d+$`)

type ec2Response struct {
	Reservations []struct {
		Instances []ec2Instance `xml:"instancesSet>item"`
	} `xml:"reservationSet>item"`
	NextToken string `xml:"nextToken"`
}

type ec2Instance struct {
	ID        string `xml:"instanceId"`
	State     string `xml:"instanceState>name"`
	PrivateIP string `xml:"privateIpAddress"`
	PublicIP  string `xml:"ipAddress"`
	PublicDNS string `xml:"dnsName"`
	Platform  string `xml:"platform"`
	Tags      []struct {
		Key   string `xml:"key"`
		Value string `xml:"value"`
	} `xml:"tagSet>item"`
}

type awsError struct {
	Errors []struct {
		Code    string `xml:"Code"`
		Message string `xml:"Message"`
	} `xml:"Errors>Error"`
}

// fetchAWS lists EC2 instances in every configured region. secret is the
// secret access key, optionally followed by a newline and a session token.
func fetchAWS(ctx context.Context, cfg Config, secret string, now time.Time) ([]Instance, error) {
	if cfg.AccessKeyID == "" || secret == "" {
		return nil, errors.New("access key ID and secret access key are required")
	}
	if len(cfg.Regions) == 0 {
		return nil, errors.New("choose at least one region")
	}
	secretKey, token, _ := strings.Cut(secret, "\n")
	client := &http.Client{Timeout: requestTimeout}
	var out []Instance
	for _, region := range cfg.Regions {
		region = strings.TrimSpace(region)
		if !regionRe.MatchString(region) {
			return nil, fmt.Errorf("invalid region %q", region)
		}
		next := ""
		for page := 0; page < 50; page++ {
			q := url.Values{"Action": {"DescribeInstances"}, "Version": {"2016-11-15"}, "MaxResults": {"1000"}}
			if next != "" {
				q.Set("NextToken", next)
			}
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, ec2Endpoint(region)+"?"+canonicalQuery(q), nil)
			if err != nil {
				return nil, err
			}
			signV4(req, strings.TrimSpace(cfg.AccessKeyID), strings.TrimSpace(secretKey), strings.TrimSpace(token), region, "ec2", now)
			resp, err := client.Do(req)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", region, err)
			}
			body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
			resp.Body.Close()
			if err != nil {
				return nil, err
			}
			if resp.StatusCode != http.StatusOK {
				var ae awsError
				if xml.Unmarshal(body, &ae) == nil && len(ae.Errors) > 0 {
					return nil, fmt.Errorf("%s: %s: %s", region, ae.Errors[0].Code, ae.Errors[0].Message)
				}
				return nil, fmt.Errorf("%s: HTTP %d", region, resp.StatusCode)
			}
			var r ec2Response
			if err := xml.Unmarshal(body, &r); err != nil {
				return nil, fmt.Errorf("%s: unexpected response: %w", region, err)
			}
			for _, res := range r.Reservations {
				for _, in := range res.Instances {
					if in.State == "terminated" || in.State == "shutting-down" {
						continue
					}
					out = append(out, in.toInstance(region, cfg.Address))
				}
			}
			if r.NextToken == "" {
				break
			}
			next = r.NextToken
		}
	}
	return out, nil
}

func (in ec2Instance) toInstance(region, prefer string) Instance {
	name := ""
	for _, t := range in.Tags {
		if t.Key == "Name" {
			name = t.Value
		}
	}
	if name == "" {
		name = in.ID
	}
	addr := in.PrivateIP
	if (prefer == "public" || addr == "") && in.PublicIP != "" {
		addr = in.PublicIP
	}
	if addr == "" {
		addr = in.PublicDNS
	}
	return Instance{
		ExternalID: region + "/" + in.ID,
		Name:       name,
		Address:    addr,
		Windows:    strings.EqualFold(in.Platform, "windows"),
		Running:    in.State == "running",
		Group:      region,
		Tags:       []string{"aws", region},
	}
}
