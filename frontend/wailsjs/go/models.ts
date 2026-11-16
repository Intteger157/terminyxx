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
	
	export class RDPProfile {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    username: string;
	    domain: string;
	    password: string;
	    width: number;
	    height: number;
	    fullscreen: boolean;
	    folderId: string;
	    sortOrder: number;
	
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
	        this.width = source["width"];
	        this.height = source["height"];
	        this.fullscreen = source["fullscreen"];
	        this.folderId = source["folderId"];
	        this.sortOrder = source["sortOrder"];
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
	    }
	}

}

