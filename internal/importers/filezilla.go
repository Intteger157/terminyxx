package importers

import (
	"encoding/xml"
	"os"
	"path/filepath"
	"strings"
)

// FileZilla's Site Manager (sitemanager.xml) nests <Folder> elements whose
// text is the folder name. Protocol 1 is SFTP; others (FTP, FTPS, S3, ...)
// are skipped.

func init() {
	register(source{
		SourceInfo: SourceInfo{
			ID: "filezilla", Name: "FileZilla", Pick: "file",
			FilterName: "FileZilla Site Manager (sitemanager.xml)", Filter: "*.xml",
			Hint: "Choose sitemanager.xml, or export sites from File → Export.",
		},
		detect: func() string {
			return existing(
				filepath.Join(os.Getenv("APPDATA"), "FileZilla", "sitemanager.xml"),
				filepath.Join(home(), ".config", "filezilla", "sitemanager.xml"),
				filepath.Join(home(), ".filezilla", "sitemanager.xml"),
			)
		},
		read: readFileZilla,
	})
}

type fzServer struct {
	Name     string `xml:"Name"`
	Host     string `xml:"Host"`
	Port     int    `xml:"Port"`
	Protocol int    `xml:"Protocol"`
	User     string `xml:"User"`
	Keyfile  string `xml:"Keyfile"`
}

type fzFolder struct {
	Text    string     `xml:",chardata"`
	Folders []fzFolder `xml:"Folder"`
	Servers []fzServer `xml:"Server"`
}

type fzFile struct {
	Servers fzFolder `xml:"Servers"`
}

var fzProtocols = map[int]string{0: "FTP", 3: "FTPS", 4: "FTPES", 5: "Storj", 6: "S3", 7: "WebDAV"}

func readFileZilla(paths []string) (Result, error) {
	res := Result{Path: paths[0], Skipped: map[string]int{}}
	text, err := readText(paths[0])
	if err != nil {
		return res, err
	}
	var f fzFile
	if err := xml.Unmarshal([]byte(text), &f); err != nil {
		return res, err
	}
	var walk func(node fzFolder, path []string)
	walk = func(node fzFolder, path []string) {
		for _, s := range node.Servers {
			if s.Protocol != 1 {
				name := fzProtocols[s.Protocol]
				if name == "" {
					name = "Other"
				}
				res.Skipped[name]++
				continue
			}
			if s.Host == "" {
				continue
			}
			name := strings.TrimSpace(s.Name)
			if name == "" {
				name = s.Host
			}
			res.Hosts = append(res.Hosts, Host{
				Name:    name,
				Folder:  append([]string{}, path...),
				Kind:    "ssh",
				Host:    s.Host,
				Port:    cleanPort(s.Port, 22),
				User:    s.User,
				KeyFile: expandKeyPath(s.Keyfile, ""),
			})
		}
		for _, sub := range node.Folders {
			name := strings.TrimSpace(sub.Text)
			if name == "" {
				name = "Folder"
			}
			walk(sub, append(append([]string{}, path...), name))
		}
	}
	walk(f.Servers, nil)
	return res, nil
}
