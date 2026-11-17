export namespace capture {
	
	export class SharingState {
	    supported: boolean;
	    active: boolean;
	    apps: string[];
	
	    static createFrom(source: any = {}) {
	        return new SharingState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.supported = source["supported"];
	        this.active = source["active"];
	        this.apps = source["apps"];
	    }
	}

}

export namespace connection {
	
	export class ConnectRequest {
	    id: string;
	    host: string;
	    port: number;
	    username: string;
	    authType: string;
	    password: string;
	    keyPath: string;
	    passphrase: string;
	    acceptHostKey: string;
	    replaceHostKey: boolean;
	    profileId: string;
	    allowLegacyAlgorithms: boolean;
	    agentForwarding: boolean;
	    jump: ConnectRequest[];
	    jumpFor: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.authType = source["authType"];
	        this.password = source["password"];
	        this.keyPath = source["keyPath"];
	        this.passphrase = source["passphrase"];
	        this.acceptHostKey = source["acceptHostKey"];
	        this.replaceHostKey = source["replaceHostKey"];
	        this.profileId = source["profileId"];
	        this.allowLegacyAlgorithms = source["allowLegacyAlgorithms"];
	        this.agentForwarding = source["agentForwarding"];
	        this.jump = this.convertValues(source["jump"], ConnectRequest);
	        this.jumpFor = source["jumpFor"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FileEntry {
	    name: string;
	    path: string;
	    isDir: boolean;
	    isLink: boolean;
	    size: number;
	    mode: string;
	    modTime: string;
	
	    static createFrom(source: any = {}) {
	        return new FileEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isDir = source["isDir"];
	        this.isLink = source["isLink"];
	        this.size = source["size"];
	        this.mode = source["mode"];
	        this.modTime = source["modTime"];
	    }
	}
	export class TransferRequest {
	    jobId: string;
	    direction: string;
	    sources: string[];
	    destDir: string;
	    move: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TransferRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.jobId = source["jobId"];
	        this.direction = source["direction"];
	        this.sources = source["sources"];
	        this.destDir = source["destDir"];
	        this.move = source["move"];
	    }
	}
	export class TrustedHost {
	    id: string;
	    hosts: string[];
	    hashed: boolean;
	    keyType: string;
	    fingerprint: string;
	    marker: string;
	    source: string;
	
	    static createFrom(source: any = {}) {
	        return new TrustedHost(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.hosts = source["hosts"];
	        this.hashed = source["hashed"];
	        this.keyType = source["keyType"];
	        this.fingerprint = source["fingerprint"];
	        this.marker = source["marker"];
	        this.source = source["source"];
	    }
	}
	export class TunnelInfo {
	    id: string;
	    kind: string;
	    bindHost: string;
	    bindPort: number;
	    destHost: string;
	    destPort: number;
	    listenAddr: string;
	    active: number;
	    total: number;
	
	    static createFrom(source: any = {}) {
	        return new TunnelInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.bindHost = source["bindHost"];
	        this.bindPort = source["bindPort"];
	        this.destHost = source["destHost"];
	        this.destPort = source["destPort"];
	        this.listenAddr = source["listenAddr"];
	        this.active = source["active"];
	        this.total = source["total"];
	    }
	}
	export class TunnelSpec {
	    id: string;
	    kind: string;
	    bindHost: string;
	    bindPort: number;
	    destHost: string;
	    destPort: number;
	
	    static createFrom(source: any = {}) {
	        return new TunnelSpec(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.bindHost = source["bindHost"];
	        this.bindPort = source["bindPort"];
	        this.destHost = source["destHost"];
	        this.destPort = source["destPort"];
	    }
	}

}

export namespace importers {
	
	export class Host {
	    name: string;
	    folder: string[];
	    kind: string;
	    host: string;
	    port: number;
	    user: string;
	    keyFile: string;
	    warning: string;
	    domain: string;
	    width: number;
	    height: number;
	    fullscreen: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Host(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.folder = source["folder"];
	        this.kind = source["kind"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.keyFile = source["keyFile"];
	        this.warning = source["warning"];
	        this.domain = source["domain"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.fullscreen = source["fullscreen"];
	    }
	}
	export class Result {
	    source: string;
	    path: string;
	    hosts: Host[];
	    skipped: Record<string, number>;
	    notes: string[];
	
	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.source = source["source"];
	        this.path = source["path"];
	        this.hosts = this.convertValues(source["hosts"], Host);
	        this.skipped = source["skipped"];
	        this.notes = source["notes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SourceInfo {
	    id: string;
	    name: string;
	    detected: string;
	    pick: string;
	    filterName: string;
	    filter: string;
	    hint: string;
	
	    static createFrom(source: any = {}) {
	        return new SourceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.detected = source["detected"];
	        this.pick = source["pick"];
	        this.filterName = source["filterName"];
	        this.filter = source["filter"];
	        this.hint = source["hint"];
	    }
	}

}

export namespace rdp {
	
	export class Options {
	    clipboard: boolean;
	    printers: boolean;
	    drives: boolean;
	    allDrives: boolean;
	    smartCards: boolean;
	    comPorts: boolean;
	    usb: boolean;
	    audio: string;
	    microphone: boolean;
	    camera: boolean;
	    multiMon: boolean;
	    dynamicRes: boolean;
	    smartSizing: boolean;
	    admin: boolean;
	    gateway: string;
	    drivePaths: string[];
	
	    static createFrom(source: any = {}) {
	        return new Options(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.clipboard = source["clipboard"];
	        this.printers = source["printers"];
	        this.drives = source["drives"];
	        this.allDrives = source["allDrives"];
	        this.smartCards = source["smartCards"];
	        this.comPorts = source["comPorts"];
	        this.usb = source["usb"];
	        this.audio = source["audio"];
	        this.microphone = source["microphone"];
	        this.camera = source["camera"];
	        this.multiMon = source["multiMon"];
	        this.dynamicRes = source["dynamicRes"];
	        this.smartSizing = source["smartSizing"];
	        this.admin = source["admin"];
	        this.gateway = source["gateway"];
	        this.drivePaths = source["drivePaths"];
	    }
	}
	export class RDPProfile {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    username: string;
	    domain: string;
	    password: string;
	    hasPassword: boolean;
	    clearPassword: boolean;
	    width: number;
	    height: number;
	    fullscreen: boolean;
	    folderId: string;
	    sortOrder: number;
	    options: Options;
	
	    static createFrom(source: any = {}) {
	        return new RDPProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.domain = source["domain"];
	        this.password = source["password"];
	        this.hasPassword = source["hasPassword"];
	        this.clearPassword = source["clearPassword"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.fullscreen = source["fullscreen"];
	        this.folderId = source["folderId"];
	        this.sortOrder = source["sortOrder"];
	        this.options = this.convertValues(source["options"], Options);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace security {
	
	export class BiometricInfo {
	    available: boolean;
	    kind: string;
	    reason: string;
	
	    static createFrom(source: any = {}) {
	        return new BiometricInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.kind = source["kind"];
	        this.reason = source["reason"];
	    }
	}
	export class LockStatus {
	    configured: boolean;
	    locked: boolean;
	    retryAfterMs: number;
	
	    static createFrom(source: any = {}) {
	        return new LockStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.configured = source["configured"];
	        this.locked = source["locked"];
	        this.retryAfterMs = source["retryAfterMs"];
	    }
	}

}

export namespace store {
	
	export class Folder {
	    id: string;
	    name: string;
	    parentId: string;
	    color: string;
	    sortOrder: number;
	
	    static createFrom(source: any = {}) {
	        return new Folder(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.parentId = source["parentId"];
	        this.color = source["color"];
	        this.sortOrder = source["sortOrder"];
	    }
	}
	export class Tunnel {
	    id: string;
	    kind: string;
	    bindHost: string;
	    bindPort: number;
	    destHost: string;
	    destPort: number;
	    autoStart: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Tunnel(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.bindHost = source["bindHost"];
	        this.bindPort = source["bindPort"];
	        this.destHost = source["destHost"];
	        this.destPort = source["destPort"];
	        this.autoStart = source["autoStart"];
	    }
	}
	export class SSHProfile {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    username: string;
	    authType: string;
	    password: string;
	    hasPassword: boolean;
	    clearPassword: boolean;
	    keyPath: string;
	    folderId: string;
	    sortOrder: number;
	    allowLegacyAlgorithms: boolean;
	    agentForwarding: boolean;
	    jumpProfileId: string;
	    tunnels: Tunnel[];
	
	    static createFrom(source: any = {}) {
	        return new SSHProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.authType = source["authType"];
	        this.password = source["password"];
	        this.hasPassword = source["hasPassword"];
	        this.clearPassword = source["clearPassword"];
	        this.keyPath = source["keyPath"];
	        this.folderId = source["folderId"];
	        this.sortOrder = source["sortOrder"];
	        this.allowLegacyAlgorithms = source["allowLegacyAlgorithms"];
	        this.agentForwarding = source["agentForwarding"];
	        this.jumpProfileId = source["jumpProfileId"];
	        this.tunnels = this.convertValues(source["tunnels"], Tunnel);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Snippet {
	    id: string;
	    name: string;
	    command: string;
	    description: string;
	    group: string;
	    execute: boolean;
	    sortOrder: number;
	
	    static createFrom(source: any = {}) {
	        return new Snippet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.command = source["command"];
	        this.description = source["description"];
	        this.group = source["group"];
	        this.execute = source["execute"];
	        this.sortOrder = source["sortOrder"];
	    }
	}

}

export namespace updater {
	
	export class Result {
	    current: string;
	    latest: string;
	    available: boolean;
	    url: string;
	    notes: string;
	    downloadUrl: string;
	    downloadName: string;
	
	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.current = source["current"];
	        this.latest = source["latest"];
	        this.available = source["available"];
	        this.url = source["url"];
	        this.notes = source["notes"];
	        this.downloadUrl = source["downloadUrl"];
	        this.downloadName = source["downloadName"];
	    }
	}

}

