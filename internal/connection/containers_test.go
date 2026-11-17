package connection

import (
	"strings"
	"testing"
)

func TestParseDocker(t *testing.T) {
	out := "3f2a9c1b7d10|web-1|nginx:1.25|Up 3 hours\n" +
		"a1b2c3d4e5f6|db_main|postgres:16|Up 2 days (healthy)\n" +
		"bad|na me; rm -rf /|img|Up\n" + // unsafe name: dropped
		"garbage line\n"
	list, err := parseContainers(RuntimeDocker, out)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].Name != "web-1" || list[1].Status != "Up 2 days (healthy)" {
		t.Fatalf("%+v", list)
	}
	want := "docker exec -it 3f2a9c1b7d10 sh -c 'command -v bash >/dev/null 2>&1 && exec bash || exec sh'"
	if list[0].ExecCommand != want {
		t.Errorf("exec command:\n got %s\nwant %s", list[0].ExecCommand, want)
	}
}

func TestParseKubectl(t *testing.T) {
	out := "default   api-7d9f8   Running\nkube-system   coredns-abc   Running\n"
	list, err := parseContainers(RuntimeKubectl, out)
	if err != nil || len(list) != 2 {
		t.Fatalf("%+v %v", list, err)
	}
	if list[1].Namespace != "kube-system" || !strings.HasPrefix(list[1].ExecCommand, "kubectl exec -it -n kube-system coredns-abc -- sh -c") {
		t.Errorf("%+v", list[1])
	}
}

func TestParseContainerErrors(t *testing.T) {
	cases := map[string]string{
		"permission denied while trying to connect to the docker daemon socket": "permission denied",
		"sh: 1: docker: not found": "not installed",
		"":                         "no running containers",
	}
	for out, want := range cases {
		_, err := parseContainers(RuntimeDocker, out)
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%q: %v (want %q)", out, err, want)
		}
	}
	if _, err := listCommand("rm -rf"); err == nil {
		t.Error("unknown runtime accepted")
	}
}
