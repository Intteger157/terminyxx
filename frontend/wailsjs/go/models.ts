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
	
	export class AgentStatus {
	    running: boolean;
	    source: string;
	    keys: sshkeys.AgentKey[];
	
	    static createFrom(source: any = {}) {
	        return new AgentStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.source = source["source"];
	        this.keys = this.convertValues(source["keys"], sshkeys.AgentKey);
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
	export class ProxySpec {
	    type: string;
	    host: string;
	    port: number;
	    username: string;
	    password: string;
	    command: string;
	
	    static createFrom(source: any = {}) {
	        return new ProxySpec(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.command = source["command"];
	    }
	}
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
	    acceptHostKeyAddress: string;
	    replaceHostKey: boolean;
	    profileId: string;
	    allowLegacyAlgorithms: boolean;
	    agentForwarding: boolean;
	    jump: ConnectRequest[];
	    jumpFor: string;
	    encoding: string;
	    startup: string;
	    proxy: ProxySpec;
	    x11: boolean;
	
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
	        this.acceptHostKeyAddress = source["acceptHostKeyAddress"];
	        this.replaceHostKey = source["replaceHostKey"];
	        this.profileId = source["profileId"];
	        this.allowLegacyAlgorithms = source["allowLegacyAlgorithms"];
	        this.agentForwarding = source["agentForwarding"];
	        this.jump = this.convertValues(source["jump"], ConnectRequest);
	        this.jumpFor = source["jumpFor"];
	        this.encoding = source["encoding"];
	        this.startup = source["startup"];
	        this.proxy = this.convertValues(source["proxy"], ProxySpec);
	        this.x11 = source["x11"];
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
	export class Container {
	    runtime: string;
	    id: string;
	    name: string;
	    namespace: string;
	    image: string;
	    status: string;
	    execCommand: string;
	
	    static createFrom(source: any = {}) {
	        return new Container(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.runtime = source["runtime"];
	        this.id = source["id"];
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.image = source["image"];
	        this.status = source["status"];
	        this.execCommand = source["execCommand"];
	    }
	}
	export class EditFile {
	    content: string;
	    version: string;
	    mode: string;
	
	    static createFrom(source: any = {}) {
	        return new EditFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.content = source["content"];
	        this.version = source["version"];
	        this.mode = source["mode"];
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
	export class HostStats {
	    cpuPercent: number;
	    cores: number;
	    load1: number;
	    load5: number;
	    load15: number;
	    memTotal: number;
	    memUsed: number;
	    swapTotal: number;
	    swapUsed: number;
	    diskTotal: number;
	    diskUsed: number;
	    uptimeSec: number;
	    rxPerSec: number;
	    txPerSec: number;
	
	    static createFrom(source: any = {}) {
	        return new HostStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cpuPercent = source["cpuPercent"];
	        this.cores = source["cores"];
	        this.load1 = source["load1"];
	        this.load5 = source["load5"];
	        this.load15 = source["load15"];
	        this.memTotal = source["memTotal"];
	        this.memUsed = source["memUsed"];
	        this.swapTotal = source["swapTotal"];
	        this.swapUsed = source["swapUsed"];
	        this.diskTotal = source["diskTotal"];
	        this.diskUsed = source["diskUsed"];
	        this.uptimeSec = source["uptimeSec"];
	        this.rxPerSec = source["rxPerSec"];
	        this.txPerSec = source["txPerSec"];
	    }
	}
	
	export class SSHCheck {
	    address: string;
	    jump: boolean;
	    stage: string;
	    failure: string;
	
	    static createFrom(source: any = {}) {
	        return new SSHCheck(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.address = source["address"];
	        this.jump = source["jump"];
	        this.stage = source["stage"];
	        this.failure = source["failure"];
	    }
	}
	export class SSHDiagnostic {
	    checks: SSHCheck[];
	
	    static createFrom(source: any = {}) {
	        return new SSHDiagnostic(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.checks = this.convertValues(source["checks"], SSHCheck);
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
	export class StreamRequest {
	    id: string;
	    kind: string;
	    host: string;
	    port: number;
	    device: string;
	    baud: number;
	    dataBits: number;
	    parity: string;
	    stopBits: string;
	
	    static createFrom(source: any = {}) {
	        return new StreamRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.device = source["device"];
	        this.baud = source["baud"];
	        this.dataBits = source["dataBits"];
	        this.parity = source["parity"];
	        this.stopBits = source["stopBits"];
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
	
	export class Hop {
	    index: number;
	    host: string;
	    port: number;
	    user: string;
	
	    static createFrom(source: any = {}) {
	        return new Hop(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	    }
	}
	export class Host {
	    name: string;
	    folder: string[];
	    kind: string;
	    host: string;
	    port: number;
	    user: string;
	    keyFile: string;
	    jump: Hop[];
	    proxyCommand: string;
	    x11: boolean;
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
	        this.jump = this.convertValues(source["jump"], Hop);
	        this.proxyCommand = source["proxyCommand"];
	        this.x11 = source["x11"];
	        this.warning = source["warning"];
	        this.domain = source["domain"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.fullscreen = source["fullscreen"];
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

export namespace inventory {
	
	export class Config {
	    url: string;
	    tokenId: string;
	    fingerprint: string;
	    accessKeyId: string;
	    regions: string[];
	    username: string;
	    keyPath: string;
	    identityId: string;
	    address: string;
	    runningOnly: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.tokenId = source["tokenId"];
	        this.fingerprint = source["fingerprint"];
	        this.accessKeyId = source["accessKeyId"];
	        this.regions = source["regions"];
	        this.username = source["username"];
	        this.keyPath = source["keyPath"];
	        this.identityId = source["identityId"];
	        this.address = source["address"];
	        this.runningOnly = source["runningOnly"];
	    }
	}

}

export namespace main {
	
	export class PingResult {
	    key: string;
	    up: boolean;
	    ms: number;
	
	    static createFrom(source: any = {}) {
	        return new PingResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.up = source["up"];
	        this.ms = source["ms"];
	    }
	}
	export class PingTarget {
	    key: string;
	    host: string;
	    port: number;
	
	    static createFrom(source: any = {}) {
	        return new PingTarget(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.host = source["host"];
	        this.port = source["port"];
	    }
	}
	export class RDPSession {
	    proxyUrl: string;
	    token: string;
	    destination: string;
	    username: string;
	    password: string;
	    domain: string;
	    width: number;
	    height: number;
	    clipboard: boolean;
	    printers: boolean;
	    printerDrivers: string;
	    audio: string;
	    drives: rdpdrive.Drive[];
	    drivesFailed: string[];
	    driveUrl: string;
	    driveTrace: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RDPSession(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.proxyUrl = source["proxyUrl"];
	        this.token = source["token"];
	        this.destination = source["destination"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.domain = source["domain"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.clipboard = source["clipboard"];
	        this.printers = source["printers"];
	        this.printerDrivers = source["printerDrivers"];
	        this.audio = source["audio"];
	        this.drives = this.convertValues(source["drives"], rdpdrive.Drive);
	        this.drivesFailed = source["drivesFailed"];
	        this.driveUrl = source["driveUrl"];
	        this.driveTrace = source["driveTrace"];
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

export namespace pasteboard {
	
	export class Content {
	    text?: string;
	    html?: string;
	    png?: string;
	
	    static createFrom(source: any = {}) {
	        return new Content(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.text = source["text"];
	        this.html = source["html"];
	        this.png = source["png"];
	    }
	}

}

export namespace printing {
	
	export class Printer {
	    name: string;
	    driver: string;
	    default: boolean;
	    network: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Printer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.driver = source["driver"];
	        this.default = source["default"];
	        this.network = source["network"];
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
	    printerDrivers: string;
	    drivesReadOnly: boolean;
	
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
	        this.printerDrivers = source["printerDrivers"];
	        this.drivesReadOnly = source["drivesReadOnly"];
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

export namespace rdpdrive {
	
	export class Drive {
	    deviceId: number;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new Drive(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.deviceId = source["deviceId"];
	        this.name = source["name"];
	    }
	}

}

export namespace rdpgw {
	
	export class TrustedCert {
	    dest: string;
	    fingerprint: string;
	    subject: string;
	    notAfter: number;
	    added: number;
	
	    static createFrom(source: any = {}) {
	        return new TrustedCert(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dest = source["dest"];
	        this.fingerprint = source["fingerprint"];
	        this.subject = source["subject"];
	        this.notAfter = source["notAfter"];
	        this.added = source["added"];
	    }
	}

}

export namespace recording {
	
	export class Event {
	    time: number;
	    kind: string;
	    data: string;
	
	    static createFrom(source: any = {}) {
	        return new Event(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.time = source["time"];
	        this.kind = source["kind"];
	        this.data = source["data"];
	    }
	}
	export class Hit {
	    name: string;
	    title: string;
	    time: number;
	    line: string;
	    startedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Hit(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.title = source["title"];
	        this.time = source["time"];
	        this.line = source["line"];
	        this.startedAt = source["startedAt"];
	    }
	}
	export class Info {
	    name: string;
	    title: string;
	    startedAt: number;
	    duration: number;
	    size: number;
	    cols: number;
	    rows: number;
	
	    static createFrom(source: any = {}) {
	        return new Info(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.title = source["title"];
	        this.startedAt = source["startedAt"];
	        this.duration = source["duration"];
	        this.size = source["size"];
	        this.cols = source["cols"];
	        this.rows = source["rows"];
	    }
	}
	export class Recording {
	    info: Info;
	    events: Event[];
	
	    static createFrom(source: any = {}) {
	        return new Recording(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.info = this.convertValues(source["info"], Info);
	        this.events = this.convertValues(source["events"], Event);
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

export namespace sshkeys {
	
	export class AgentKey {
	    type: string;
	    fingerprint: string;
	    comment: string;
	    publicKey: string;
	
	    static createFrom(source: any = {}) {
	        return new AgentKey(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.fingerprint = source["fingerprint"];
	        this.comment = source["comment"];
	        this.publicKey = source["publicKey"];
	    }
	}
	export class Key {
	    name: string;
	    path: string;
	    type: string;
	    fingerprint: string;
	    comment: string;
	    encrypted: boolean;
	    publicKey: string;
	
	    static createFrom(source: any = {}) {
	        return new Key(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.type = source["type"];
	        this.fingerprint = source["fingerprint"];
	        this.comment = source["comment"];
	        this.encrypted = source["encrypted"];
	        this.publicKey = source["publicKey"];
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
	export class HostMeta {
	    kind: string;
	    id: string;
	    favorite: boolean;
	    tags: string[];
	    notes: string;
	    lastUsed: number;
	
	    static createFrom(source: any = {}) {
	        return new HostMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.id = source["id"];
	        this.favorite = source["favorite"];
	        this.tags = source["tags"];
	        this.notes = source["notes"];
	        this.lastUsed = source["lastUsed"];
	    }
	}
	export class HostOptions {
	    color: string;
	    startupCommands: string;
	    encoding: string;
	    themeId: string;
	
	    static createFrom(source: any = {}) {
	        return new HostOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.color = source["color"];
	        this.startupCommands = source["startupCommands"];
	        this.encoding = source["encoding"];
	        this.themeId = source["themeId"];
	    }
	}
	export class Identity {
	    id: string;
	    name: string;
	    username: string;
	    authType: string;
	    password: string;
	    hasPassword: boolean;
	    clearPassword: boolean;
	    keyPath: string;
	    sortOrder: number;
	    hosts: number;
	
	    static createFrom(source: any = {}) {
	        return new Identity(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.username = source["username"];
	        this.authType = source["authType"];
	        this.password = source["password"];
	        this.hasPassword = source["hasPassword"];
	        this.clearPassword = source["clearPassword"];
	        this.keyPath = source["keyPath"];
	        this.sortOrder = source["sortOrder"];
	        this.hosts = source["hosts"];
	    }
	}
	export class ImportResult {
	    folders: number;
	    hosts: number;
	    snippets: number;
	    identities: number;
	    replaced: string[];
	    flagsReset: number;
	    rdpRedirectionSkipped: number;
	
	    static createFrom(source: any = {}) {
	        return new ImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folders = source["folders"];
	        this.hosts = source["hosts"];
	        this.snippets = source["snippets"];
	        this.identities = source["identities"];
	        this.replaced = source["replaced"];
	        this.flagsReset = source["flagsReset"];
	        this.rdpRedirectionSkipped = source["rdpRedirectionSkipped"];
	    }
	}
	export class Inventory {
	    id: string;
	    name: string;
	    kind: string;
	    config: inventory.Config;
	    folderId: string;
	    lastSync: number;
	    secret: string;
	    hasSecret: boolean;
	    clearSecret: boolean;
	    hosts: number;
	
	    static createFrom(source: any = {}) {
	        return new Inventory(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.config = this.convertValues(source["config"], inventory.Config);
	        this.folderId = source["folderId"];
	        this.lastSync = source["lastSync"];
	        this.secret = source["secret"];
	        this.hasSecret = source["hasSecret"];
	        this.clearSecret = source["clearSecret"];
	        this.hosts = source["hosts"];
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
	export class InventorySync {
	    added: number;
	    updated: number;
	    unchanged: number;
	    gone: string[];
	    noAddress: number;
	
	    static createFrom(source: any = {}) {
	        return new InventorySync(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.added = source["added"];
	        this.updated = source["updated"];
	        this.unchanged = source["unchanged"];
	        this.gone = source["gone"];
	        this.noAddress = source["noAddress"];
	    }
	}
	export class ProxySettings {
	    type: string;
	    host: string;
	    port: number;
	    username: string;
	    password: string;
	    hasPassword: boolean;
	    clearPassword: boolean;
	    command: string;
	
	    static createFrom(source: any = {}) {
	        return new ProxySettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.hasPassword = source["hasPassword"];
	        this.clearPassword = source["clearPassword"];
	        this.command = source["command"];
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
	    sftpOnly: boolean;
	    identityId: string;
	    options: HostOptions;
	    proxy: ProxySettings;
	    x11Forwarding: boolean;
	
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
	        this.sftpOnly = source["sftpOnly"];
	        this.identityId = source["identityId"];
	        this.options = this.convertValues(source["options"], HostOptions);
	        this.proxy = this.convertValues(source["proxy"], ProxySettings);
	        this.x11Forwarding = source["x11Forwarding"];
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
	export class StreamProfile {
	    id: string;
	    name: string;
	    kind: string;
	    host: string;
	    port: number;
	    device: string;
	    baud: number;
	    dataBits: number;
	    parity: string;
	    stopBits: string;
	    folderId: string;
	    sortOrder: number;
	
	    static createFrom(source: any = {}) {
	        return new StreamProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.device = source["device"];
	        this.baud = source["baud"];
	        this.dataBits = source["dataBits"];
	        this.parity = source["parity"];
	        this.stopBits = source["stopBits"];
	        this.folderId = source["folderId"];
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

