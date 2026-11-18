var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _t2, _e2, _a, _b;
typeof window < "u" && (window.__svelte || (window.__svelte = { v: /* @__PURE__ */ new Set() })).v.add("5");
const rr = 2, sr = "[", nr = "]", Je = {}, W = Symbol(), ii = false, J = 2, vi = 4, St = 8, Ht = 16, xe = 32, ze = 64, bt = 128, H = 256, vt = 512, q = 1024, ye = 2048, Be = 4096, mt = 8192, Dt = 16384, or = 32768, ar = 65536, lr = 1 << 19, mi = 1 << 20, ct = Symbol("$state"), ur = Symbol("legacy props");
var wi = Array.isArray, dr = Array.prototype.indexOf, cr = Array.from, wt = Object.keys, gt = Object.defineProperty, Ue = Object.getOwnPropertyDescriptor, hr = Object.getOwnPropertyDescriptors, fr = Object.prototype, pr = Array.prototype, gi = Object.getPrototypeOf;
function _i(t) {
  for (var e = 0; e < t.length; e++)
    t[e]();
}
let et = [], Bt = [];
function xi() {
  var t = et;
  et = [], _i(t);
}
function br() {
  var t = Bt;
  Bt = [], _i(t);
}
function jt(t) {
  et.length === 0 && queueMicrotask(xi), et.push(t);
}
function ri() {
  et.length > 0 && xi(), Bt.length > 0 && br();
}
function yi(t) {
  return t === this.v;
}
function vr(t, e) {
  return t != t ? e == e : t !== e || t !== null && typeof t == "object" || typeof t == "function";
}
function mr(t) {
  return !vr(t, this.v);
}
function wr(t) {
  throw new Error("https://svelte.dev/e/effect_in_teardown");
}
function gr() {
  throw new Error("https://svelte.dev/e/effect_in_unowned_derived");
}
function _r(t) {
  throw new Error("https://svelte.dev/e/effect_orphan");
}
function xr() {
  throw new Error("https://svelte.dev/e/effect_update_depth_exceeded");
}
function yr() {
  throw new Error("https://svelte.dev/e/hydration_failed");
}
function Cr() {
  throw new Error("https://svelte.dev/e/state_descriptors_fixed");
}
function Er() {
  throw new Error("https://svelte.dev/e/state_prototype_fixed");
}
function kr() {
  throw new Error("https://svelte.dev/e/state_unsafe_local_read");
}
function Sr() {
  throw new Error("https://svelte.dev/e/state_unsafe_mutation");
}
let Dr = false;
function oe(t, e) {
  var i = {
    f: 0,
    // TODO ideally we could skip this altogether, but it causes type errors
    v: t,
    reactions: null,
    equals: yi,
    rv: 0,
    wv: 0
  };
  return i;
}
function Lt(t) {
  return /* @__PURE__ */ Tr(oe(t));
}
// @__NO_SIDE_EFFECTS__
function Ci(t, e = false) {
  const i = oe(t);
  return e || (i.equals = mr), i;
}
// @__NO_SIDE_EFFECTS__
function Tr(t) {
  return S !== null && !Z && (S.f & J) !== 0 && (ae === null ? Mr([t]) : ae.push(t)), t;
}
function V(t, e) {
  return S !== null && !Z && Hi() && (S.f & (J | Ht)) !== 0 && // If the source was created locally within the current derived, then
  // we allow the mutation.
  (ae === null || !ae.includes(t)) && Sr(), Rr(t, e);
}
function Rr(t, e) {
  return t.equals(e) || (t.v, t.v = e, t.wv = Li(), Ei(t, ye), T !== null && (T.f & q) !== 0 && (T.f & (xe | ze)) === 0 && (ce === null ? Lr([t]) : ce.push(t))), e;
}
function Ei(t, e) {
  var i = t.reactions;
  if (i !== null)
    for (var r = i.length, s = 0; s < r; s++) {
      var o = i[s], d = o.f;
      (d & ye) === 0 && (fe(o, e), (d & (q | H)) !== 0 && ((d & J) !== 0 ? Ei(
        /** @type {Derived} */
        o,
        Be
      ) : Zt(
        /** @type {Effect} */
        o
      )));
    }
}
// @__NO_SIDE_EFFECTS__
function ki(t) {
  var e = J | ye, i = S !== null && (S.f & J) !== 0 ? (
    /** @type {Derived} */
    S
  ) : null;
  return T === null || i !== null && (i.f & H) !== 0 ? e |= H : T.f |= mi, {
    ctx: z,
    deps: null,
    effects: null,
    equals: yi,
    f: e,
    fn: t,
    reactions: null,
    rv: 0,
    v: (
      /** @type {V} */
      null
    ),
    wv: 0,
    parent: i ?? T
  };
}
function Si(t) {
  var e = t.effects;
  if (e !== null) {
    t.effects = null;
    for (var i = 0; i < e.length; i += 1)
      _e(
        /** @type {Effect} */
        e[i]
      );
  }
}
function Or(t) {
  for (var e = t.parent; e !== null; ) {
    if ((e.f & J) === 0)
      return (
        /** @type {Effect} */
        e
      );
    e = e.parent;
  }
  return null;
}
function Ar(t) {
  var e, i = T;
  ge(Or(t));
  try {
    Si(t), e = Fi(t);
  } finally {
    ge(i);
  }
  return e;
}
function Di(t) {
  var e = Ar(t), i = (me || (t.f & H) !== 0) && t.deps !== null ? Be : q;
  fe(t, i), t.equals(e) || (t.v = e, t.wv = Li());
}
function Gt(t) {
  console.warn("https://svelte.dev/e/hydration_mismatch");
}
let Q = false;
function lt(t) {
  Q = t;
}
let I;
function _t(t) {
  if (t === null)
    throw Gt(), Je;
  return I = t;
}
function Ti() {
  return _t(
    /** @type {TemplateNode} */
    /* @__PURE__ */ Tt(I)
  );
}
function Pt(t) {
  if (Q) {
    if (/* @__PURE__ */ Tt(I) !== null)
      throw Gt(), Je;
    I = t;
  }
}
function Se(t, e = null, i) {
  if (typeof t != "object" || t === null || ct in t)
    return t;
  const r = gi(t);
  if (r !== fr && r !== pr)
    return t;
  var s = /* @__PURE__ */ new Map(), o = wi(t), d = oe(0);
  o && s.set("length", oe(
    /** @type {any[]} */
    t.length
  ));
  var b;
  return new Proxy(
    /** @type {any} */
    t,
    {
      defineProperty(c, v, p) {
        (!("value" in p) || p.configurable === false || p.enumerable === false || p.writable === false) && Cr();
        var m = s.get(v);
        return m === void 0 ? (m = oe(p.value), s.set(v, m)) : V(m, Se(p.value, b)), true;
      },
      deleteProperty(c, v) {
        var p = s.get(v);
        if (p === void 0)
          v in c && s.set(v, oe(W));
        else {
          if (o && typeof v == "string") {
            var m = (
              /** @type {Source<number>} */
              s.get("length")
            ), n = Number(v);
            Number.isInteger(n) && n < m.v && V(m, n);
          }
          V(p, W), si(d);
        }
        return true;
      },
      get(c, v, p) {
        var _a2;
        if (v === ct)
          return t;
        var m = s.get(v), n = v in c;
        if (m === void 0 && (!n || ((_a2 = Ue(c, v)) == null ? void 0 : _a2.writable)) && (m = oe(Se(n ? c[v] : W, b)), s.set(v, m)), m !== void 0) {
          var l = U(m);
          return l === W ? void 0 : l;
        }
        return Reflect.get(c, v, p);
      },
      getOwnPropertyDescriptor(c, v) {
        var p = Reflect.getOwnPropertyDescriptor(c, v);
        if (p && "value" in p) {
          var m = s.get(v);
          m && (p.value = U(m));
        } else if (p === void 0) {
          var n = s.get(v), l = n == null ? void 0 : n.v;
          if (n !== void 0 && l !== W)
            return {
              enumerable: true,
              configurable: true,
              value: l,
              writable: true
            };
        }
        return p;
      },
      has(c, v) {
        var _a2;
        if (v === ct)
          return true;
        var p = s.get(v), m = p !== void 0 && p.v !== W || Reflect.has(c, v);
        if (p !== void 0 || T !== null && (!m || ((_a2 = Ue(c, v)) == null ? void 0 : _a2.writable))) {
          p === void 0 && (p = oe(m ? Se(c[v], b) : W), s.set(v, p));
          var n = U(p);
          if (n === W)
            return false;
        }
        return m;
      },
      set(c, v, p, m) {
        var _a2;
        var n = s.get(v), l = v in c;
        if (o && v === "length")
          for (var a = p; a < /** @type {Source<number>} */
          n.v; a += 1) {
            var u = s.get(a + "");
            u !== void 0 ? V(u, W) : a in c && (u = oe(W), s.set(a + "", u));
          }
        n === void 0 ? (!l || ((_a2 = Ue(c, v)) == null ? void 0 : _a2.writable)) && (n = oe(void 0), V(n, Se(p, b)), s.set(v, n)) : (l = n.v !== W, V(n, Se(p, b)));
        var h = Reflect.getOwnPropertyDescriptor(c, v);
        if ((h == null ? void 0 : h.set) && h.set.call(m, p), !l) {
          if (o && typeof v == "string") {
            var A = (
              /** @type {Source<number>} */
              s.get("length")
            ), $ = Number(v);
            Number.isInteger($) && $ >= A.v && V(A, $ + 1);
          }
          si(d);
        }
        return true;
      },
      ownKeys(c) {
        U(d);
        var v = Reflect.ownKeys(c).filter((n) => {
          var l = s.get(n);
          return l === void 0 || l.v !== W;
        });
        for (var [p, m] of s)
          m.v !== W && !(p in c) && v.push(p);
        return v;
      },
      setPrototypeOf() {
        Er();
      }
    }
  );
}
function si(t, e = 1) {
  V(t, t.v + e);
}
var ni, Ri, Oi, Ai;
function It() {
  if (ni === void 0) {
    ni = window, Ri = /Firefox/.test(navigator.userAgent);
    var t = Element.prototype, e = Node.prototype;
    Oi = Ue(e, "firstChild").get, Ai = Ue(e, "nextSibling").get, t.__click = void 0, t.__className = void 0, t.__attributes = null, t.__styles = null, t.__e = void 0, Text.prototype.__t = void 0;
  }
}
function $i(t = "") {
  return document.createTextNode(t);
}
// @__NO_SIDE_EFFECTS__
function xt(t) {
  return Oi.call(t);
}
// @__NO_SIDE_EFFECTS__
function Tt(t) {
  return Ai.call(t);
}
function Ft(t, e) {
  if (!Q)
    return /* @__PURE__ */ xt(t);
  var i = (
    /** @type {TemplateNode} */
    /* @__PURE__ */ xt(I)
  );
  return i === null && (i = I.appendChild($i())), _t(i), i;
}
function $r(t) {
  t.textContent = "";
}
let ht = false, yt = false, Ct = null, ft = false, Yt = false;
function oi(t) {
  Yt = t;
}
let Qe = [];
let S = null, Z = false;
function we(t) {
  S = t;
}
let T = null;
function ge(t) {
  T = t;
}
let ae = null;
function Mr(t) {
  ae = t;
}
let N = null, K = 0, ce = null;
function Lr(t) {
  ce = t;
}
let Mi = 1, Et = 0, me = false;
function Li() {
  return ++Mi;
}
function Rt(t) {
  var _a2;
  var e = t.f;
  if ((e & ye) !== 0)
    return true;
  if ((e & Be) !== 0) {
    var i = t.deps, r = (e & H) !== 0;
    if (i !== null) {
      var s, o, d = (e & vt) !== 0, b = r && T !== null && !me, c = i.length;
      if (d || b) {
        var v = (
          /** @type {Derived} */
          t
        ), p = v.parent;
        for (s = 0; s < c; s++)
          o = i[s], (d || !((_a2 = o == null ? void 0 : o.reactions) == null ? void 0 : _a2.includes(v))) && (o.reactions ?? (o.reactions = [])).push(v);
        d && (v.f ^= vt), b && p !== null && (p.f & H) === 0 && (v.f ^= H);
      }
      for (s = 0; s < c; s++)
        if (o = i[s], Rt(
          /** @type {Derived} */
          o
        ) && Di(
          /** @type {Derived} */
          o
        ), o.wv > t.wv)
          return true;
    }
    (!r || T !== null && !me) && fe(t, q);
  }
  return false;
}
function Pr(t, e) {
  for (var i = e; i !== null; ) {
    if ((i.f & bt) !== 0)
      try {
        i.fn(t);
        return;
      } catch {
        i.f ^= bt;
      }
    i = i.parent;
  }
  throw ht = false, t;
}
function Fr(t) {
  return (t.f & Dt) === 0 && (t.parent === null || (t.parent.f & bt) === 0);
}
function Ot(t, e, i, r) {
  if (ht) {
    if (i === null && (ht = false), Fr(e))
      throw t;
    return;
  }
  i !== null && (ht = true);
  {
    Pr(t, e);
    return;
  }
}
function Pi(t, e, i = true) {
  var r = t.reactions;
  if (r !== null)
    for (var s = 0; s < r.length; s++) {
      var o = r[s];
      (o.f & J) !== 0 ? Pi(
        /** @type {Derived} */
        o,
        e,
        false
      ) : e === o && (i ? fe(o, ye) : (o.f & q) !== 0 && fe(o, Be), Zt(
        /** @type {Effect} */
        o
      ));
    }
}
function Fi(t) {
  var _a2;
  var e = N, i = K, r = ce, s = S, o = me, d = ae, b = z, c = Z, v = t.f;
  N = /** @type {null | Value[]} */
  null, K = 0, ce = null, me = (v & H) !== 0 && (Z || !ft || S === null), S = (v & (xe | ze)) === 0 ? t : null, ae = null, ai(t.ctx), Z = false, Et++;
  try {
    var p = (
      /** @type {Function} */
      (0, t.fn)()
    ), m = t.deps;
    if (N !== null) {
      var n;
      if (kt(t, K), m !== null && K > 0)
        for (m.length = K + N.length, n = 0; n < N.length; n++)
          m[K + n] = N[n];
      else
        t.deps = m = N;
      if (!me)
        for (n = K; n < m.length; n++)
          ((_a2 = m[n]).reactions ?? (_a2.reactions = [])).push(t);
    } else m !== null && K < m.length && (kt(t, K), m.length = K);
    if (Hi() && ce !== null && !Z && m !== null && (t.f & (J | Be | ye)) === 0)
      for (n = 0; n < /** @type {Source[]} */
      ce.length; n++)
        Pi(
          ce[n],
          /** @type {Effect} */
          t
        );
    return s !== null && Et++, p;
  } finally {
    N = e, K = i, ce = r, S = s, me = o, ae = d, ai(b), Z = c;
  }
}
function Nr(t, e) {
  let i = e.reactions;
  if (i !== null) {
    var r = dr.call(i, t);
    if (r !== -1) {
      var s = i.length - 1;
      s === 0 ? i = e.reactions = null : (i[r] = i[s], i.pop());
    }
  }
  i === null && (e.f & J) !== 0 && // Destroying a child effect while updating a parent effect can cause a dependency to appear
  // to be unused, when in fact it is used by the currently-updating parent. Checking `new_deps`
  // allows us to skip the expensive work of disconnecting and immediately reconnecting it
  (N === null || !N.includes(e)) && (fe(e, Be), (e.f & (H | vt)) === 0 && (e.f ^= vt), Si(
    /** @type {Derived} **/
    e
  ), kt(
    /** @type {Derived} **/
    e,
    0
  ));
}
function kt(t, e) {
  var i = t.deps;
  if (i !== null)
    for (var r = e; r < i.length; r++)
      Nr(t, i[r]);
}
function Xt(t) {
  var e = t.f;
  if ((e & Dt) === 0) {
    fe(t, q);
    var i = T, r = z, s = ft;
    T = t, ft = true;
    try {
      (e & Ht) !== 0 ? Zr(t) : Bi(t), zi(t);
      var o = Fi(t);
      t.teardown = typeof o == "function" ? o : null, t.wv = Mi;
      var d = t.deps, b;
      ii && Dr && t.f & ye;
    } catch (c) {
      Ot(c, t, i, r || t.ctx);
    } finally {
      ft = s, T = i;
    }
  }
}
function Ur() {
  try {
    xr();
  } catch (t) {
    if (Ct !== null)
      Ot(t, Ct, null);
    else
      throw t;
  }
}
function Ni() {
  try {
    for (var t = 0; Qe.length > 0; ) {
      t++ > 1e3 && Ur();
      var e = Qe, i = e.length;
      Qe = [];
      for (var r = 0; r < i; r++) {
        var s = e[r];
        (s.f & q) === 0 && (s.f ^= q);
        var o = Br(s);
        zr(o);
      }
    }
  } finally {
    yt = false, Ct = null;
  }
}
function zr(t) {
  var e = t.length;
  if (e !== 0)
    for (var i = 0; i < e; i++) {
      var r = t[i];
      if ((r.f & (Dt | mt)) === 0)
        try {
          Rt(r) && (Xt(r), r.deps === null && r.first === null && r.nodes_start === null && (r.teardown === null ? Ii(r) : r.fn = null));
        } catch (s) {
          Ot(s, r, null, r.ctx);
        }
    }
}
function Zt(t) {
  yt || (yt = true, queueMicrotask(Ni));
  for (var e = Ct = t; e.parent !== null; ) {
    e = e.parent;
    var i = e.f;
    if ((i & (ze | xe)) !== 0) {
      if ((i & q) === 0) return;
      e.f ^= q;
    }
  }
  Qe.push(e);
}
function Br(t) {
  for (var e = [], i = t.first; i !== null; ) {
    var r = i.f, s = (r & xe) !== 0, o = s && (r & q) !== 0;
    if (!o && (r & mt) === 0) {
      if ((r & vi) !== 0)
        e.push(i);
      else if (s)
        i.f ^= q;
      else {
        var d = S;
        try {
          S = i, Rt(i) && Xt(i);
        } catch (v) {
          Ot(v, i, null, i.ctx);
        } finally {
          S = d;
        }
      }
      var b = i.first;
      if (b !== null) {
        i = b;
        continue;
      }
    }
    var c = i.parent;
    for (i = i.next; i === null && c !== null; )
      i = c.next, c = c.parent;
  }
  return e;
}
function Ge(t) {
  var e;
  for (ri(); Qe.length > 0; )
    yt = true, Ni(), ri();
  return (
    /** @type {T} */
    e
  );
}
function U(t) {
  var e = t.f, i = (e & J) !== 0;
  if (S !== null && !Z) {
    ae !== null && ae.includes(t) && kr();
    var r = S.deps;
    t.rv < Et && (t.rv = Et, N === null && r !== null && r[K] === t ? K++ : N === null ? N = [t] : (!me || !N.includes(t)) && N.push(t));
  } else if (i && /** @type {Derived} */
  t.deps === null && /** @type {Derived} */
  t.effects === null) {
    var s = (
      /** @type {Derived} */
      t
    ), o = s.parent;
    o !== null && (o.f & H) === 0 && (s.f ^= H);
  }
  return i && (s = /** @type {Derived} */
  t, Rt(s) && Di(s)), t.v;
}
function At(t) {
  var e = Z;
  try {
    return Z = true, t();
  } finally {
    Z = e;
  }
}
const Ir = -7169;
function fe(t, e) {
  t.f = t.f & Ir | e;
}
function Wr(t) {
  T === null && S === null && _r(), S !== null && (S.f & H) !== 0 && T === null && gr(), Yt && wr();
}
function Kr(t, e) {
  var i = e.last;
  i === null ? e.last = e.first = t : (i.next = t, t.prev = i, e.last = t);
}
function De(t, e, i, r = true) {
  var s = (t & ze) !== 0, o = T, d = {
    ctx: z,
    deps: null,
    nodes_start: null,
    nodes_end: null,
    f: t | ye,
    first: null,
    fn: e,
    last: null,
    next: null,
    parent: s ? null : o,
    prev: null,
    teardown: null,
    transitions: null,
    wv: 0
  };
  if (i)
    try {
      Xt(d), d.f |= or;
    } catch (v) {
      throw _e(d), v;
    }
  else e !== null && Zt(d);
  var b = i && d.deps === null && d.first === null && d.nodes_start === null && d.teardown === null && (d.f & (mi | bt)) === 0;
  if (!b && !s && r && (o !== null && Kr(d, o), S !== null && (S.f & J) !== 0)) {
    var c = (
      /** @type {Derived} */
      S
    );
    (c.effects ?? (c.effects = [])).push(d);
  }
  return d;
}
function Vr(t) {
  const e = De(St, null, false);
  return fe(e, q), e.teardown = t, e;
}
function qr(t) {
  Wr();
  var e = T !== null && (T.f & xe) !== 0 && z !== null && !z.m;
  if (e) {
    var i = (
      /** @type {ComponentContext} */
      z
    );
    (i.e ?? (i.e = [])).push({
      fn: t,
      effect: T,
      reaction: S
    });
  } else {
    var r = Jt(t);
    return r;
  }
}
function Hr(t) {
  const e = De(ze, t, true);
  return () => {
    _e(e);
  };
}
function jr(t) {
  const e = De(ze, t, true);
  return (i = {}) => new Promise((r) => {
    i.outro ? Jr(e, () => {
      _e(e), r(void 0);
    }) : (_e(e), r(void 0));
  });
}
function Jt(t) {
  return De(vi, t, false);
}
function Ui(t) {
  return De(St, t, true);
}
function Gr(t, e = [], i = ki) {
  const r = e.map(i);
  return Yr(() => t(...r.map(U)));
}
function Yr(t, e = 0) {
  return De(St | Ht | e, t, true);
}
function Xr(t, e = true) {
  return De(St | xe, t, true, e);
}
function zi(t) {
  var e = t.teardown;
  if (e !== null) {
    const i = Yt, r = S;
    oi(true), we(null);
    try {
      e.call(null);
    } finally {
      oi(i), we(r);
    }
  }
}
function Bi(t, e = false) {
  var i = t.first;
  for (t.first = t.last = null; i !== null; ) {
    var r = i.next;
    _e(i, e), i = r;
  }
}
function Zr(t) {
  for (var e = t.first; e !== null; ) {
    var i = e.next;
    (e.f & xe) === 0 && _e(e), e = i;
  }
}
function _e(t, e = true) {
  var i = false;
  if ((e || (t.f & lr) !== 0) && t.nodes_start !== null) {
    for (var r = t.nodes_start, s = t.nodes_end; r !== null; ) {
      var o = r === s ? null : (
        /** @type {TemplateNode} */
        /* @__PURE__ */ Tt(r)
      );
      r.remove(), r = o;
    }
    i = true;
  }
  Bi(t, e && !i), kt(t, 0), fe(t, Dt);
  var d = t.transitions;
  if (d !== null)
    for (const c of d)
      c.stop();
  zi(t);
  var b = t.parent;
  b !== null && b.first !== null && Ii(t), t.next = t.prev = t.teardown = t.ctx = t.deps = t.fn = t.nodes_start = t.nodes_end = null;
}
function Ii(t) {
  var e = t.parent, i = t.prev, r = t.next;
  i !== null && (i.next = r), r !== null && (r.prev = i), e !== null && (e.first === t && (e.first = r), e.last === t && (e.last = i));
}
function Jr(t, e) {
  var i = [];
  Wi(t, i, true), Qr(i, () => {
    _e(t), e && e();
  });
}
function Qr(t, e) {
  var i = t.length;
  if (i > 0) {
    var r = () => --i || e();
    for (var s of t)
      s.out(r);
  } else
    e();
}
function Wi(t, e, i) {
  if ((t.f & mt) === 0) {
    if (t.f ^= mt, t.transitions !== null)
      for (const d of t.transitions)
        (d.is_global || i) && e.push(d);
    for (var r = t.first; r !== null; ) {
      var s = r.next, o = (r.f & ar) !== 0 || (r.f & xe) !== 0;
      Wi(r, e, o ? i : false), r = s;
    }
  }
}
function Ki(t) {
  throw new Error("https://svelte.dev/e/lifecycle_outside_component");
}
let z = null;
function ai(t) {
  z = t;
}
function Vi(t, e = false, i) {
  z = {
    p: z,
    c: null,
    e: null,
    m: false,
    s: t,
    x: null,
    l: null
  };
}
function qi(t) {
  const e = z;
  if (e !== null) {
    t !== void 0 && (e.x = t);
    const d = e.e;
    if (d !== null) {
      var i = T, r = S;
      e.e = null;
      try {
        for (var s = 0; s < d.length; s++) {
          var o = d[s];
          ge(o.effect), we(o.reaction), Jt(o.fn);
        }
      } finally {
        ge(i), we(r);
      }
    }
    z = e.p, e.m = true;
  }
  return t || /** @type {T} */
  {};
}
function Hi() {
  return true;
}
const es = ["touchstart", "touchmove"];
function ts(t) {
  return es.includes(t);
}
function is(t) {
  var e = S, i = T;
  we(null), ge(null);
  try {
    return t();
  } finally {
    we(e), ge(i);
  }
}
const ji = /* @__PURE__ */ new Set(), Wt = /* @__PURE__ */ new Set();
function rs(t, e, i, r = {}) {
  function s(o) {
    if (r.capture || Ye.call(e, o), !o.cancelBubble)
      return is(() => i == null ? void 0 : i.call(this, o));
  }
  return t.startsWith("pointer") || t.startsWith("touch") || t === "wheel" ? jt(() => {
    e.addEventListener(t, s, r);
  }) : e.addEventListener(t, s, r), s;
}
function ut(t, e, i, r, s) {
  var o = { capture: r, passive: s }, d = rs(t, e, i, o);
  (e === document.body || e === window || e === document) && Vr(() => {
    e.removeEventListener(t, d, o);
  });
}
function ss(t) {
  for (var e = 0; e < t.length; e++)
    ji.add(t[e]);
  for (var i of Wt)
    i(t);
}
function Ye(t) {
  var _a2;
  var e = this, i = (
    /** @type {Node} */
    e.ownerDocument
  ), r = t.type, s = ((_a2 = t.composedPath) == null ? void 0 : _a2.call(t)) || [], o = (
    /** @type {null | Element} */
    s[0] || t.target
  ), d = 0, b = t.__root;
  if (b) {
    var c = s.indexOf(b);
    if (c !== -1 && (e === document || e === /** @type {any} */
    window)) {
      t.__root = e;
      return;
    }
    var v = s.indexOf(e);
    if (v === -1)
      return;
    c <= v && (d = c);
  }
  if (o = /** @type {Element} */
  s[d] || t.target, o !== e) {
    gt(t, "currentTarget", {
      configurable: true,
      get() {
        return o || i;
      }
    });
    var p = S, m = T;
    we(null), ge(null);
    try {
      for (var n, l = []; o !== null; ) {
        var a = o.assignedSlot || o.parentNode || /** @type {any} */
        o.host || null;
        try {
          var u = o["__" + r];
          if (u !== void 0 && (!/** @type {any} */
          o.disabled || // DOM could've been updated already by the time this is reached, so we check this as well
          // -> the target could not have been disabled because it emits the event in the first place
          t.target === o))
            if (wi(u)) {
              var [h, ...A] = u;
              h.apply(o, [t, ...A]);
            } else
              u.call(o, t);
        } catch ($) {
          n ? l.push($) : n = $;
        }
        if (t.cancelBubble || a === e || a === null)
          break;
        o = a;
      }
      if (n) {
        for (let $ of l)
          queueMicrotask(() => {
            throw $;
          });
        throw n;
      }
    } finally {
      t.__root = e, delete t.currentTarget, we(p), ge(m);
    }
  }
}
function ns(t) {
  var e = document.createElement("template");
  return e.innerHTML = t, e.content;
}
function Kt(t, e) {
  var i = (
    /** @type {Effect} */
    T
  );
  i.nodes_start === null && (i.nodes_start = t, i.nodes_end = e);
}
// @__NO_SIDE_EFFECTS__
function os(t, e) {
  var i = (e & rr) !== 0, r, s = !t.startsWith("<!>");
  return () => {
    if (Q)
      return Kt(I, null), I;
    r === void 0 && (r = ns(s ? t : "<!>" + t), r = /** @type {Node} */
    /* @__PURE__ */ xt(r));
    var o = (
      /** @type {TemplateNode} */
      i || Ri ? document.importNode(r, true) : r.cloneNode(true)
    );
    return Kt(o, o), o;
  };
}
function Gi(t, e) {
  if (Q) {
    T.nodes_end = I, Ti();
    return;
  }
  t !== null && t.before(
    /** @type {Node} */
    e
  );
}
function Yi(t, e) {
  return Xi(t, e);
}
function as(t, e) {
  It(), e.intro = e.intro ?? false;
  const i = e.target, r = Q, s = I;
  try {
    for (var o = (
      /** @type {TemplateNode} */
      /* @__PURE__ */ xt(i)
    ); o && (o.nodeType !== 8 || /** @type {Comment} */
    o.data !== sr); )
      o = /** @type {TemplateNode} */
      /* @__PURE__ */ Tt(o);
    if (!o)
      throw Je;
    lt(true), _t(
      /** @type {Comment} */
      o
    ), Ti();
    const d = Xi(t, { ...e, anchor: o });
    if (I === null || I.nodeType !== 8 || /** @type {Comment} */
    I.data !== nr)
      throw Gt(), Je;
    return lt(false), /**  @type {Exports} */
    d;
  } catch (d) {
    if (d === Je)
      return e.recover === false && yr(), It(), $r(i), lt(false), Yi(t, e);
    throw d;
  } finally {
    lt(r), _t(s);
  }
}
const Fe = /* @__PURE__ */ new Map();
function Xi(t, { target: e, anchor: i, props: r = {}, events: s, context: o, intro: d = true }) {
  It();
  var b = /* @__PURE__ */ new Set(), c = (m) => {
    for (var n = 0; n < m.length; n++) {
      var l = m[n];
      if (!b.has(l)) {
        b.add(l);
        var a = ts(l);
        e.addEventListener(l, Ye, { passive: a });
        var u = Fe.get(l);
        u === void 0 ? (document.addEventListener(l, Ye, { passive: a }), Fe.set(l, 1)) : Fe.set(l, u + 1);
      }
    }
  };
  c(cr(ji)), Wt.add(c);
  var v = void 0, p = jr(() => {
    var m = i ?? e.appendChild($i());
    return Xr(() => {
      if (o) {
        Vi({});
        var n = (
          /** @type {ComponentContext} */
          z
        );
        n.c = o;
      }
      s && (r.$$events = s), Q && Kt(
        /** @type {TemplateNode} */
        m,
        null
      ), v = t(m, r) || {}, Q && (T.nodes_end = I), o && qi();
    }), () => {
      var _a2;
      for (var n of b) {
        e.removeEventListener(n, Ye);
        var l = (
          /** @type {number} */
          Fe.get(n)
        );
        --l === 0 ? (document.removeEventListener(n, Ye), Fe.delete(n)) : Fe.set(n, l);
      }
      Wt.delete(c), m !== i && ((_a2 = m.parentNode) == null ? void 0 : _a2.removeChild(m));
    };
  });
  return Vt.set(v, p), v;
}
let Vt = /* @__PURE__ */ new WeakMap();
function ls(t, e) {
  const i = Vt.get(t);
  return i ? (Vt.delete(t), i(e)) : Promise.resolve();
}
function us(t, e) {
  jt(() => {
    var i = t.getRootNode(), r = (
      /** @type {ShadowRoot} */
      i.host ? (
        /** @type {ShadowRoot} */
        i
      ) : (
        /** @type {Document} */
        i.head ?? /** @type {Document} */
        i.ownerDocument.head
      )
    );
    if (!r.querySelector("#" + e.hash)) {
      const s = document.createElement("style");
      s.id = e.hash, s.textContent = e.code, r.appendChild(s);
    }
  });
}
const li = [...` 	
\r\f\xA0\v\uFEFF`];
function ds(t, e, i) {
  var r = t == null ? "" : "" + t;
  if (r = r ? r + " " + e : e, i) {
    for (var s in i)
      if (i[s])
        r = r ? r + " " + s : s;
      else if (r.length)
        for (var o = s.length, d = 0; (d = r.indexOf(s, d)) >= 0; ) {
          var b = d + o;
          (d === 0 || li.includes(r[d - 1])) && (b === r.length || li.includes(r[b])) ? r = (d === 0 ? "" : r.substring(0, d)) + r.substring(b + 1) : d = b;
        }
  }
  return r === "" ? null : r;
}
function cs(t, e, i, r, s, o) {
  var d = t.__className;
  if (Q || d !== i) {
    var b = ds(i, r, o);
    (!Q || b !== t.getAttribute("class")) && (b == null ? t.removeAttribute("class") : t.className = b), t.__className = i;
  } else if (o)
    for (var c in o) {
      var v = !!o[c];
      (s == null || v !== !!s[c]) && t.classList.toggle(c, v);
    }
  return o;
}
function ui(t, e, i, r) {
  var s = t.__attributes ?? (t.__attributes = {});
  Q && (s[e] = t.getAttribute(e)), s[e] !== (s[e] = i) && ("__styles" in t && (t.__styles = {}), i == null ? t.removeAttribute(e) : typeof i != "string" && hs(t).includes(e) ? t[e] = i : t.setAttribute(e, i));
}
var di = /* @__PURE__ */ new Map();
function hs(t) {
  var e = di.get(t.nodeName);
  if (e) return e;
  di.set(t.nodeName, e = []);
  for (var i, r = t, s = Element.prototype; s !== r; ) {
    i = hr(r);
    for (var o in i)
      i[o].set && e.push(o);
    r = gi(r);
  }
  return e;
}
function ci(t, e) {
  return t === e || (t == null ? void 0 : t[ct]) === e;
}
function Nt(t = {}, e, i, r) {
  return Jt(() => {
    var s, o;
    return Ui(() => {
      s = o, o = [], At(() => {
        t !== i(...o) && (e(t, ...o), s && ci(i(...s), t) && e(null, ...s));
      });
    }), () => {
      jt(() => {
        o && ci(i(...o), t) && e(null, ...o);
      });
    };
  }), t;
}
function Zi(t) {
  z === null && Ki(), qr(() => {
    const e = At(t);
    if (typeof e == "function") return (
      /** @type {() => void} */
      e
    );
  });
}
function fs(t) {
  z === null && Ki(), Zi(() => () => At(t));
}
function dt(t, e, i, r) {
  var s;
  s = /** @type {V} */
  t[e];
  var o = (
    /** @type {V} */
    r
  ), d = true, b = false, c = () => (b = true, d && (d = false, o = /** @type {V} */
  r), o), v;
  v = () => {
    var l = (
      /** @type {V} */
      t[e]
    );
    return l === void 0 ? c() : (d = true, b = false, l);
  };
  var p = false, m = /* @__PURE__ */ Ci(s), n = /* @__PURE__ */ ki(() => {
    var l = v(), a = U(m);
    return p ? (p = false, a) : m.v = l;
  });
  return function(l, a) {
    if (arguments.length > 0) {
      const u = a ? U(n) : l;
      return n.equals(u) || (p = true, V(m, u), b && o !== void 0 && (o = u), At(() => U(n))), l;
    }
    return U(n);
  };
}
function ps(t) {
  return new bs(t);
}
class bs {
  /**
   * @param {ComponentConstructorOptions & {
   *  component: any;
   * }} options
   */
  constructor(e) {
    /** @type {any} */
    __privateAdd(this, _t2);
    /** @type {Record<string, any>} */
    __privateAdd(this, _e2);
    var _a2;
    var i = /* @__PURE__ */ new Map(), r = (o, d) => {
      var b = /* @__PURE__ */ Ci(d);
      return i.set(o, b), b;
    };
    const s = new Proxy(
      { ...e.props || {}, $$events: {} },
      {
        get(o, d) {
          return U(i.get(d) ?? r(d, Reflect.get(o, d)));
        },
        has(o, d) {
          return d === ur ? true : (U(i.get(d) ?? r(d, Reflect.get(o, d))), Reflect.has(o, d));
        },
        set(o, d, b) {
          return V(i.get(d) ?? r(d, b), b), Reflect.set(o, d, b);
        }
      }
    );
    __privateSet(this, _e2, (e.hydrate ? as : Yi)(e.component, {
      target: e.target,
      anchor: e.anchor,
      props: s,
      context: e.context,
      intro: e.intro ?? false,
      recover: e.recover
    })), (!((_a2 = e == null ? void 0 : e.props) == null ? void 0 : _a2.$$host) || e.sync === false) && Ge(), __privateSet(this, _t2, s.$$events);
    for (const o of Object.keys(__privateGet(this, _e2)))
      o === "$set" || o === "$destroy" || o === "$on" || gt(this, o, {
        get() {
          return __privateGet(this, _e2)[o];
        },
        /** @param {any} value */
        set(d) {
          __privateGet(this, _e2)[o] = d;
        },
        enumerable: true
      });
    __privateGet(this, _e2).$set = /** @param {Record<string, any>} next */
    (o) => {
      Object.assign(s, o);
    }, __privateGet(this, _e2).$destroy = () => {
      ls(__privateGet(this, _e2));
    };
  }
  /** @param {Record<string, any>} props */
  $set(e) {
    __privateGet(this, _e2).$set(e);
  }
  /**
   * @param {string} event
   * @param {(...args: any[]) => any} callback
   * @returns {any}
   */
  $on(e, i) {
    __privateGet(this, _t2)[e] = __privateGet(this, _t2)[e] || [];
    const r = (...s) => i.call(this, ...s);
    return __privateGet(this, _t2)[e].push(r), () => {
      __privateGet(this, _t2)[e] = __privateGet(this, _t2)[e].filter(
        /** @param {any} fn */
        (s) => s !== r
      );
    };
  }
  $destroy() {
    __privateGet(this, _e2).$destroy();
  }
}
_t2 = new WeakMap();
_e2 = new WeakMap();
let Ji;
typeof HTMLElement == "function" && (Ji = class extends HTMLElement {
  /**
   * @param {*} $$componentCtor
   * @param {*} $$slots
   * @param {*} use_shadow_dom
   */
  constructor(t, e, i) {
    super();
    /** The Svelte component constructor */
    __publicField(this, "$$ctor");
    /** Slots */
    __publicField(this, "$$s");
    /** @type {any} The Svelte component instance */
    __publicField(this, "$$c");
    /** Whether or not the custom element is connected */
    __publicField(this, "$$cn", false);
    /** @type {Record<string, any>} Component props data */
    __publicField(this, "$$d", {});
    /** `true` if currently in the process of reflecting component props back to attributes */
    __publicField(this, "$$r", false);
    /** @type {Record<string, CustomElementPropDefinition>} Props definition (name, reflected, type etc) */
    __publicField(this, "$$p_d", {});
    /** @type {Record<string, EventListenerOrEventListenerObject[]>} Event listeners */
    __publicField(this, "$$l", {});
    /** @type {Map<EventListenerOrEventListenerObject, Function>} Event listener unsubscribe functions */
    __publicField(this, "$$l_u", /* @__PURE__ */ new Map());
    /** @type {any} The managed render effect for reflecting attributes */
    __publicField(this, "$$me");
    this.$$ctor = t, this.$$s = e, i && this.attachShadow({ mode: "open" });
  }
  /**
   * @param {string} type
   * @param {EventListenerOrEventListenerObject} listener
   * @param {boolean | AddEventListenerOptions} [options]
   */
  addEventListener(t, e, i) {
    if (this.$$l[t] = this.$$l[t] || [], this.$$l[t].push(e), this.$$c) {
      const r = this.$$c.$on(t, e);
      this.$$l_u.set(e, r);
    }
    super.addEventListener(t, e, i);
  }
  /**
   * @param {string} type
   * @param {EventListenerOrEventListenerObject} listener
   * @param {boolean | AddEventListenerOptions} [options]
   */
  removeEventListener(t, e, i) {
    if (super.removeEventListener(t, e, i), this.$$c) {
      const r = this.$$l_u.get(e);
      r && (r(), this.$$l_u.delete(e));
    }
  }
  async connectedCallback() {
    if (this.$$cn = true, !this.$$c) {
      let t = function(r) {
        return (s) => {
          const o = document.createElement("slot");
          r !== "default" && (o.name = r), Gi(s, o);
        };
      };
      if (await Promise.resolve(), !this.$$cn || this.$$c)
        return;
      const e = {}, i = vs(this);
      for (const r of this.$$s)
        r in i && (r === "default" && !this.$$d.children ? (this.$$d.children = t(r), e.default = true) : e[r] = t(r));
      for (const r of this.attributes) {
        const s = this.$$g_p(r.name);
        s in this.$$d || (this.$$d[s] = pt(s, r.value, this.$$p_d, "toProp"));
      }
      for (const r in this.$$p_d)
        !(r in this.$$d) && this[r] !== void 0 && (this.$$d[r] = this[r], delete this[r]);
      this.$$c = ps({
        component: this.$$ctor,
        target: this.shadowRoot || this,
        props: {
          ...this.$$d,
          $$slots: e,
          $$host: this
        }
      }), this.$$me = Hr(() => {
        Ui(() => {
          var _a2;
          this.$$r = true;
          for (const r of wt(this.$$c)) {
            if (!((_a2 = this.$$p_d[r]) == null ? void 0 : _a2.reflect)) continue;
            this.$$d[r] = this.$$c[r];
            const s = pt(
              r,
              this.$$d[r],
              this.$$p_d,
              "toAttribute"
            );
            s == null ? this.removeAttribute(this.$$p_d[r].attribute || r) : this.setAttribute(this.$$p_d[r].attribute || r, s);
          }
          this.$$r = false;
        });
      });
      for (const r in this.$$l)
        for (const s of this.$$l[r]) {
          const o = this.$$c.$on(r, s);
          this.$$l_u.set(s, o);
        }
      this.$$l = {};
    }
  }
  // We don't need this when working within Svelte code, but for compatibility of people using this outside of Svelte
  // and setting attributes through setAttribute etc, this is helpful
  /**
   * @param {string} attr
   * @param {string} _oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(t, e, i) {
    var _a2;
    this.$$r || (t = this.$$g_p(t), this.$$d[t] = pt(t, i, this.$$p_d, "toProp"), (_a2 = this.$$c) == null ? void 0 : _a2.$set({ [t]: this.$$d[t] }));
  }
  disconnectedCallback() {
    this.$$cn = false, Promise.resolve().then(() => {
      !this.$$cn && this.$$c && (this.$$c.$destroy(), this.$$me(), this.$$c = void 0);
    });
  }
  /**
   * @param {string} attribute_name
   */
  $$g_p(t) {
    return wt(this.$$p_d).find(
      (e) => this.$$p_d[e].attribute === t || !this.$$p_d[e].attribute && e.toLowerCase() === t
    ) || t;
  }
});
function pt(t, e, i, r) {
  var _a2;
  const s = (_a2 = i[t]) == null ? void 0 : _a2.type;
  if (e = s === "Boolean" && typeof e != "boolean" ? e != null : e, !r || !i[t])
    return e;
  if (r === "toAttribute")
    switch (s) {
      case "Object":
      case "Array":
        return e == null ? null : JSON.stringify(e);
      case "Boolean":
        return e ? "" : null;
      case "Number":
        return e ?? null;
      default:
        return e;
    }
  else
    switch (s) {
      case "Object":
      case "Array":
        return e && JSON.parse(e);
      case "Boolean":
        return e;
      // conversion already handled above
      case "Number":
        return e != null ? +e : e;
      default:
        return e;
    }
}
function vs(t) {
  const e = {};
  return t.childNodes.forEach((i) => {
    e[
      /** @type {Element} node */
      i.slot || "default"
    ] = true;
  }), e;
}
function ms(t, e, i, r, s, o) {
  let d = class extends Ji {
    constructor() {
      super(t, i, s), this.$$p_d = e;
    }
    static get observedAttributes() {
      return wt(e).map(
        (b) => (e[b].attribute || b).toLowerCase()
      );
    }
  };
  return wt(e).forEach((b) => {
    gt(d.prototype, b, {
      get() {
        return this.$$c && b in this.$$c ? this.$$c[b] : this.$$d[b];
      },
      set(c) {
        var _a2;
        c = pt(b, c, e), this.$$d[b] = c;
        var v = this.$$c;
        if (v) {
          var p = (_a2 = Ue(v, b)) == null ? void 0 : _a2.get;
          p ? v[b] = c : v.$set({ [b]: c });
        }
      }
    });
  }), r.forEach((b) => {
    gt(d.prototype, b, {
      get() {
        var _a2;
        return (_a2 = this.$$c) == null ? void 0 : _a2[b];
      }
    });
  }), o && (d = o(d)), t.element = /** @type {any} */
  d, d;
}
class ws {
  constructor() {
    __publicField(this, "verbose", false);
  }
  info(e) {
    this.verbose && console.log(e);
  }
  error(e, i) {
    this.verbose && console.error(e, i);
  }
}
const M = new ws();
function gs(t) {
  return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, "default") ? t.default : t;
}
var Xe = { exports: {} }, _s = Xe.exports, hi;
function xs() {
  return hi || (hi = 1, (function(t, e) {
    (function(i, r) {
      var s = "1.0.41", o = "", d = "?", b = "function", c = "undefined", v = "object", p = "string", m = "major", n = "model", l = "name", a = "type", u = "vendor", h = "version", A = "architecture", $ = "console", g = "mobile", w = "tablet", L = "smarttv", F = "wearable", le = "embedded", pe = 500, j = "Amazon", ue = "Apple", tt = "ASUS", it = "BlackBerry", Te = "Browser", G = "Chrome", $t = "Edge", Re = "Firefox", Oe = "Google", rt = "Honor", st = "Huawei", nt = "Lenovo", Ae = "LG", Ie = "Microsoft", We = "Motorola", Ke = "Nvidia", Ve = "OnePlus", ee = "Opera", qe = "OPPO", Ce = "Samsung", ot = "Sharp", be = "Sony", $e = "Xiaomi", Me = "Zebra", Ee = "Facebook", ve = "Chromium OS", He = "Mac OS", Le = " Browser", Y = function(y, E) {
        var x = {};
        for (var D in y)
          E[D] && E[D].length % 2 === 0 ? x[D] = E[D].concat(y[D]) : x[D] = y[D];
        return x;
      }, f = function(y) {
        for (var E = {}, x = 0; x < y.length; x++)
          E[y[x].toUpperCase()] = y[x];
        return E;
      }, C = function(y, E) {
        return typeof y === p ? O(E).indexOf(O(y)) !== -1 : false;
      }, O = function(y) {
        return y.toLowerCase();
      }, R = function(y) {
        return typeof y === p ? y.replace(/[^\d\.]/g, o).split(".")[0] : r;
      }, P = function(y, E) {
        if (typeof y === p)
          return y = y.replace(/^\s\s*/, o), typeof E === c ? y : y.substring(0, pe);
      }, te = function(y, E) {
        for (var x = 0, D, de, ie, k, _, re; x < E.length && !_; ) {
          var Mt = E[x], ti = E[x + 1];
          for (D = de = 0; D < Mt.length && !_ && Mt[D]; )
            if (_ = Mt[D++].exec(y), _)
              for (ie = 0; ie < ti.length; ie++)
                re = _[++de], k = ti[ie], typeof k === v && k.length > 0 ? k.length === 2 ? typeof k[1] == b ? this[k[0]] = k[1].call(this, re) : this[k[0]] = k[1] : k.length === 3 ? typeof k[1] === b && !(k[1].exec && k[1].test) ? this[k[0]] = re ? k[1].call(this, re, k[2]) : r : this[k[0]] = re ? re.replace(k[1], k[2]) : r : k.length === 4 && (this[k[0]] = re ? k[3].call(this, re.replace(k[1], k[2])) : r) : this[k] = re || r;
          x += 2;
        }
      }, je = function(y, E) {
        for (var x in E)
          if (typeof E[x] === v && E[x].length > 0) {
            for (var D = 0; D < E[x].length; D++)
              if (C(E[x][D], y))
                return x === d ? r : x;
          } else if (C(E[x], y))
            return x === d ? r : x;
        return E.hasOwnProperty("*") ? E["*"] : y;
      }, ir = {
        "1.0": "/8",
        "1.2": "/1",
        "1.3": "/3",
        "2.0": "/412",
        "2.0.2": "/416",
        "2.0.3": "/417",
        "2.0.4": "/419",
        "?": "/"
      }, Qt = {
        ME: "4.90",
        "NT 3.11": "NT3.51",
        "NT 4.0": "NT4.0",
        2e3: "NT 5.0",
        XP: ["NT 5.1", "NT 5.2"],
        Vista: "NT 6.0",
        7: "NT 6.1",
        8: "NT 6.2",
        "8.1": "NT 6.3",
        10: ["NT 6.4", "NT 10.0"],
        RT: "ARM"
      }, ei = {
        browser: [
          [
            /\b(?:crmo|crios)\/([\w\.]+)/i
            // Chrome for Android/iOS
          ],
          [h, [l, "Chrome"]],
          [
            /edg(?:e|ios|a)?\/([\w\.]+)/i
            // Microsoft Edge
          ],
          [h, [l, "Edge"]],
          [
            // Presto based
            /(opera mini)\/([-\w\.]+)/i,
            // Opera Mini
            /(opera [mobiletab]{3,6})\b.+version\/([-\w\.]+)/i,
            // Opera Mobi/Tablet
            /(opera)(?:.+version\/|[\/ ]+)([\w\.]+)/i
            // Opera
          ],
          [l, h],
          [
            /opios[\/ ]+([\w\.]+)/i
            // Opera mini on iphone >= 8.0
          ],
          [h, [l, ee + " Mini"]],
          [
            /\bop(?:rg)?x\/([\w\.]+)/i
            // Opera GX
          ],
          [h, [l, ee + " GX"]],
          [
            /\bopr\/([\w\.]+)/i
            // Opera Webkit
          ],
          [h, [l, ee]],
          [
            // Mixed
            /\bb[ai]*d(?:uhd|[ub]*[aekoprswx]{5,6})[\/ ]?([\w\.]+)/i
            // Baidu
          ],
          [h, [l, "Baidu"]],
          [
            /\b(?:mxbrowser|mxios|myie2)\/?([-\w\.]*)\b/i
            // Maxthon
          ],
          [h, [l, "Maxthon"]],
          [
            /(kindle)\/([\w\.]+)/i,
            // Kindle
            /(lunascape|maxthon|netfront|jasmine|blazer|sleipnir)[\/ ]?([\w\.]*)/i,
            // Lunascape/Maxthon/Netfront/Jasmine/Blazer/Sleipnir
            // Trident based
            /(avant|iemobile|slim(?:browser|boat|jet))[\/ ]?([\d\.]*)/i,
            // Avant/IEMobile/SlimBrowser/SlimBoat/Slimjet
            /(?:ms|\()(ie) ([\w\.]+)/i,
            // Internet Explorer
            // Blink/Webkit/KHTML based                                         // Flock/RockMelt/Midori/Epiphany/Silk/Skyfire/Bolt/Iron/Iridium/PhantomJS/Bowser/QupZilla/Falkon
            /(flock|rockmelt|midori|epiphany|silk|skyfire|ovibrowser|bolt|iron|vivaldi|iridium|phantomjs|bowser|qupzilla|falkon|rekonq|puffin|brave|whale(?!.+naver)|qqbrowserlite|duckduckgo|klar|helio|(?=comodo_)?dragon)\/([-\w\.]+)/i,
            // Rekonq/Puffin/Brave/Whale/QQBrowserLite/QQ//Vivaldi/DuckDuckGo/Klar/Helio/Dragon
            /(heytap|ovi|115)browser\/([\d\.]+)/i,
            // HeyTap/Ovi/115
            /(weibo)__([\d\.]+)/i
            // Weibo
          ],
          [l, h],
          [
            /quark(?:pc)?\/([-\w\.]+)/i
            // Quark
          ],
          [h, [l, "Quark"]],
          [
            /\bddg\/([\w\.]+)/i
            // DuckDuckGo
          ],
          [h, [l, "DuckDuckGo"]],
          [
            /(?:\buc? ?browser|(?:juc.+)ucweb)[\/ ]?([\w\.]+)/i
            // UCBrowser
          ],
          [h, [l, "UC" + Te]],
          [
            /microm.+\bqbcore\/([\w\.]+)/i,
            // WeChat Desktop for Windows Built-in Browser
            /\bqbcore\/([\w\.]+).+microm/i,
            /micromessenger\/([\w\.]+)/i
            // WeChat
          ],
          [h, [l, "WeChat"]],
          [
            /konqueror\/([\w\.]+)/i
            // Konqueror
          ],
          [h, [l, "Konqueror"]],
          [
            /trident.+rv[: ]([\w\.]{1,9})\b.+like gecko/i
            // IE11
          ],
          [h, [l, "IE"]],
          [
            /ya(?:search)?browser\/([\w\.]+)/i
            // Yandex
          ],
          [h, [l, "Yandex"]],
          [
            /slbrowser\/([\w\.]+)/i
            // Smart Lenovo Browser
          ],
          [h, [l, "Smart Lenovo " + Te]],
          [
            /(avast|avg)\/([\w\.]+)/i
            // Avast/AVG Secure Browser
          ],
          [[l, /(.+)/, "$1 Secure " + Te], h],
          [
            /\bfocus\/([\w\.]+)/i
            // Firefox Focus
          ],
          [h, [l, Re + " Focus"]],
          [
            /\bopt\/([\w\.]+)/i
            // Opera Touch
          ],
          [h, [l, ee + " Touch"]],
          [
            /coc_coc\w+\/([\w\.]+)/i
            // Coc Coc Browser
          ],
          [h, [l, "Coc Coc"]],
          [
            /dolfin\/([\w\.]+)/i
            // Dolphin
          ],
          [h, [l, "Dolphin"]],
          [
            /coast\/([\w\.]+)/i
            // Opera Coast
          ],
          [h, [l, ee + " Coast"]],
          [
            /miuibrowser\/([\w\.]+)/i
            // MIUI Browser
          ],
          [h, [l, "MIUI" + Le]],
          [
            /fxios\/([\w\.-]+)/i
            // Firefox for iOS
          ],
          [h, [l, Re]],
          [
            /\bqihoobrowser\/?([\w\.]*)/i
            // 360
          ],
          [h, [l, "360"]],
          [
            /\b(qq)\/([\w\.]+)/i
            // QQ
          ],
          [[l, /(.+)/, "$1Browser"], h],
          [
            /(oculus|sailfish|huawei|vivo|pico)browser\/([\w\.]+)/i
          ],
          [[l, /(.+)/, "$1" + Le], h],
          [
            // Oculus/Sailfish/HuaweiBrowser/VivoBrowser/PicoBrowser
            /samsungbrowser\/([\w\.]+)/i
            // Samsung Internet
          ],
          [h, [l, Ce + " Internet"]],
          [
            /metasr[\/ ]?([\d\.]+)/i
            // Sogou Explorer
          ],
          [h, [l, "Sogou Explorer"]],
          [
            /(sogou)mo\w+\/([\d\.]+)/i
            // Sogou Mobile
          ],
          [[l, "Sogou Mobile"], h],
          [
            /(electron)\/([\w\.]+) safari/i,
            // Electron-based App
            /(tesla)(?: qtcarbrowser|\/(20\d\d\.[-\w\.]+))/i,
            // Tesla
            /m?(qqbrowser|2345(?=browser|chrome|explorer))\w*[\/ ]?v?([\w\.]+)/i
            // QQ/2345
          ],
          [l, h],
          [
            /(lbbrowser|rekonq)/i,
            // LieBao Browser/Rekonq
            /\[(linkedin)app\]/i
            // LinkedIn App for iOS & Android
          ],
          [l],
          [
            /ome\/([\w\.]+) \w* ?(iron) saf/i,
            // Iron
            /ome\/([\w\.]+).+qihu (360)[es]e/i
            // 360
          ],
          [h, l],
          [
            // WebView
            /((?:fban\/fbios|fb_iab\/fb4a)(?!.+fbav)|;fbav\/([\w\.]+);)/i
            // Facebook App for iOS & Android
          ],
          [[l, Ee], h],
          [
            /(Klarna)\/([\w\.]+)/i,
            // Klarna Shopping Browser for iOS & Android
            /(kakao(?:talk|story))[\/ ]([\w\.]+)/i,
            // Kakao App
            /(naver)\(.*?(\d+\.[\w\.]+).*\)/i,
            // Naver InApp
            /(daum)apps[\/ ]([\w\.]+)/i,
            // Daum App
            /safari (line)\/([\w\.]+)/i,
            // Line App for iOS
            /\b(line)\/([\w\.]+)\/iab/i,
            // Line App for Android
            /(alipay)client\/([\w\.]+)/i,
            // Alipay
            /(twitter)(?:and| f.+e\/([\w\.]+))/i,
            // Twitter
            /(chromium|instagram|snapchat)[\/ ]([-\w\.]+)/i
            // Chromium/Instagram/Snapchat
          ],
          [l, h],
          [
            /\bgsa\/([\w\.]+) .*safari\//i
            // Google Search Appliance on iOS
          ],
          [h, [l, "GSA"]],
          [
            /musical_ly(?:.+app_?version\/|_)([\w\.]+)/i
            // TikTok
          ],
          [h, [l, "TikTok"]],
          [
            /headlesschrome(?:\/([\w\.]+)| )/i
            // Chrome Headless
          ],
          [h, [l, G + " Headless"]],
          [
            / wv\).+(chrome)\/([\w\.]+)/i
            // Chrome WebView
          ],
          [[l, G + " WebView"], h],
          [
            /droid.+ version\/([\w\.]+)\b.+(?:mobile safari|safari)/i
            // Android Browser
          ],
          [h, [l, "Android " + Te]],
          [
            /(chrome|omniweb|arora|[tizenoka]{5} ?browser)\/v?([\w\.]+)/i
            // Chrome/OmniWeb/Arora/Tizen/Nokia
          ],
          [l, h],
          [
            /version\/([\w\.\,]+) .*mobile\/\w+ (safari)/i
            // Mobile Safari
          ],
          [h, [l, "Mobile Safari"]],
          [
            /version\/([\w(\.|\,)]+) .*(mobile ?safari|safari)/i
            // Safari & Safari Mobile
          ],
          [h, l],
          [
            /webkit.+?(mobile ?safari|safari)(\/[\w\.]+)/i
            // Safari < 3.0
          ],
          [l, [h, je, ir]],
          [
            /(webkit|khtml)\/([\w\.]+)/i
          ],
          [l, h],
          [
            // Gecko based
            /(navigator|netscape\d?)\/([-\w\.]+)/i
            // Netscape
          ],
          [[l, "Netscape"], h],
          [
            /(wolvic|librewolf)\/([\w\.]+)/i
            // Wolvic/LibreWolf
          ],
          [l, h],
          [
            /mobile vr; rv:([\w\.]+)\).+firefox/i
            // Firefox Reality
          ],
          [h, [l, Re + " Reality"]],
          [
            /ekiohf.+(flow)\/([\w\.]+)/i,
            // Flow
            /(swiftfox)/i,
            // Swiftfox
            /(icedragon|iceweasel|camino|chimera|fennec|maemo browser|minimo|conkeror)[\/ ]?([\w\.\+]+)/i,
            // IceDragon/Iceweasel/Camino/Chimera/Fennec/Maemo/Minimo/Conkeror
            /(seamonkey|k-meleon|icecat|iceape|firebird|phoenix|palemoon|basilisk|waterfox)\/([-\w\.]+)$/i,
            // Firefox/SeaMonkey/K-Meleon/IceCat/IceApe/Firebird/Phoenix
            /(firefox)\/([\w\.]+)/i,
            // Other Firefox-based
            /(mozilla)\/([\w\.]+) .+rv\:.+gecko\/\d+/i,
            // Mozilla
            // Other
            /(amaya|dillo|doris|icab|ladybird|lynx|mosaic|netsurf|obigo|polaris|w3m|(?:go|ice|up)[\. ]?browser)[-\/ ]?v?([\w\.]+)/i,
            // Polaris/Lynx/Dillo/iCab/Doris/Amaya/w3m/NetSurf/Obigo/Mosaic/Go/ICE/UP.Browser/Ladybird
            /\b(links) \(([\w\.]+)/i
            // Links
          ],
          [l, [h, /_/g, "."]],
          [
            /(cobalt)\/([\w\.]+)/i
            // Cobalt
          ],
          [l, [h, /master.|lts./, ""]]
        ],
        cpu: [
          [
            /\b((amd|x|x86[-_]?|wow|win)64)\b/i
            // AMD64 (x64)
          ],
          [[A, "amd64"]],
          [
            /(ia32(?=;))/i,
            // IA32 (quicktime)
            /\b((i[346]|x)86)(pc)?\b/i
            // IA32 (x86)
          ],
          [[A, "ia32"]],
          [
            /\b(aarch64|arm(v?[89]e?l?|_?64))\b/i
            // ARM64
          ],
          [[A, "arm64"]],
          [
            /\b(arm(v[67])?ht?n?[fl]p?)\b/i
            // ARMHF
          ],
          [[A, "armhf"]],
          [
            // PocketPC mistakenly identified as PowerPC
            /( (ce|mobile); ppc;|\/[\w\.]+arm\b)/i
          ],
          [[A, "arm"]],
          [
            /((ppc|powerpc)(64)?)( mac|;|\))/i
            // PowerPC
          ],
          [[A, /ower/, o, O]],
          [
            / sun4\w[;\)]/i
            // SPARC
          ],
          [[A, "sparc"]],
          [
            /\b(avr32|ia64(?=;)|68k(?=\))|\barm(?=v([1-7]|[5-7]1)l?|;|eabi)|(irix|mips|sparc)(64)?\b|pa-risc)/i
            // IA64, 68K, ARM/64, AVR/32, IRIX/64, MIPS/64, SPARC/64, PA-RISC
          ],
          [[A, O]]
        ],
        device: [
          [
            //////////////////////////
            // MOBILES & TABLETS
            /////////////////////////
            // Samsung
            /\b(sch-i[89]0\d|shw-m380s|sm-[ptx]\w{2,4}|gt-[pn]\d{2,4}|sgh-t8[56]9|nexus 10)/i
          ],
          [n, [u, Ce], [a, w]],
          [
            /\b((?:s[cgp]h|gt|sm)-(?![lr])\w+|sc[g-]?[\d]+a?|galaxy nexus)/i,
            /samsung[- ]((?!sm-[lr])[-\w]+)/i,
            /sec-(sgh\w+)/i
          ],
          [n, [u, Ce], [a, g]],
          [
            // Apple
            /(?:\/|\()(ip(?:hone|od)[\w, ]*)(?:\/|;)/i
            // iPod/iPhone
          ],
          [n, [u, ue], [a, g]],
          [
            /\((ipad);[-\w\),; ]+apple/i,
            // iPad
            /applecoremedia\/[\w\.]+ \((ipad)/i,
            /\b(ipad)\d\d?,\d\d?[;\]].+ios/i
          ],
          [n, [u, ue], [a, w]],
          [
            /(macintosh);/i
          ],
          [n, [u, ue]],
          [
            // Sharp
            /\b(sh-?[altvz]?\d\d[a-ekm]?)/i
          ],
          [n, [u, ot], [a, g]],
          [
            // Honor
            /\b((?:brt|eln|hey2?|gdi|jdn)-a?[lnw]09|(?:ag[rm]3?|jdn2|kob2)-a?[lw]0[09]hn)(?: bui|\)|;)/i
          ],
          [n, [u, rt], [a, w]],
          [
            /honor([-\w ]+)[;\)]/i
          ],
          [n, [u, rt], [a, g]],
          [
            // Huawei
            /\b((?:ag[rs][2356]?k?|bah[234]?|bg[2o]|bt[kv]|cmr|cpn|db[ry]2?|jdn2|got|kob2?k?|mon|pce|scm|sht?|[tw]gr|vrd)-[ad]?[lw][0125][09]b?|605hw|bg2-u03|(?:gem|fdr|m2|ple|t1)-[7a]0[1-4][lu]|t1-a2[13][lw]|mediapad[\w\. ]*(?= bui|\)))\b(?!.+d\/s)/i
          ],
          [n, [u, st], [a, w]],
          [
            /(?:huawei)([-\w ]+)[;\)]/i,
            /\b(nexus 6p|\w{2,4}e?-[atu]?[ln][\dx][012359c][adn]?)\b(?!.+d\/s)/i
          ],
          [n, [u, st], [a, g]],
          [
            // Xiaomi
            /oid[^\)]+; (2[\dbc]{4}(182|283|rp\w{2})[cgl]|m2105k81a?c)(?: bui|\))/i,
            /\b((?:red)?mi[-_ ]?pad[\w- ]*)(?: bui|\))/i
            // Mi Pad tablets
          ],
          [[n, /_/g, " "], [u, $e], [a, w]],
          [
            /\b(poco[\w ]+|m2\d{3}j\d\d[a-z]{2})(?: bui|\))/i,
            // Xiaomi POCO
            /\b; (\w+) build\/hm\1/i,
            // Xiaomi Hongmi 'numeric' models
            /\b(hm[-_ ]?note?[_ ]?(?:\d\w)?) bui/i,
            // Xiaomi Hongmi
            /\b(redmi[\-_ ]?(?:note|k)?[\w_ ]+)(?: bui|\))/i,
            // Xiaomi Redmi
            /oid[^\)]+; (m?[12][0-389][01]\w{3,6}[c-y])( bui|; wv|\))/i,
            // Xiaomi Redmi 'numeric' models
            /\b(mi[-_ ]?(?:a\d|one|one[_ ]plus|note lte|max|cc)?[_ ]?(?:\d?\w?)[_ ]?(?:plus|se|lite|pro)?)(?: bui|\))/i,
            // Xiaomi Mi
            / ([\w ]+) miui\/v?\d/i
          ],
          [[n, /_/g, " "], [u, $e], [a, g]],
          [
            // OPPO
            /; (\w+) bui.+ oppo/i,
            /\b(cph[12]\d{3}|p(?:af|c[al]|d\w|e[ar])[mt]\d0|x9007|a101op)\b/i
          ],
          [n, [u, qe], [a, g]],
          [
            /\b(opd2(\d{3}a?))(?: bui|\))/i
          ],
          [n, [u, je, { OnePlus: ["304", "403", "203"], "*": qe }], [a, w]],
          [
            // Vivo
            /vivo (\w+)(?: bui|\))/i,
            /\b(v[12]\d{3}\w?[at])(?: bui|;)/i
          ],
          [n, [u, "Vivo"], [a, g]],
          [
            // Realme
            /\b(rmx[1-3]\d{3})(?: bui|;|\))/i
          ],
          [n, [u, "Realme"], [a, g]],
          [
            // Motorola
            /\b(milestone|droid(?:[2-4x]| (?:bionic|x2|pro|razr))?:?( 4g)?)\b[\w ]+build\//i,
            /\bmot(?:orola)?[- ](\w*)/i,
            /((?:moto(?! 360)[\w\(\) ]+|xt\d{3,4}|nexus 6)(?= bui|\)))/i
          ],
          [n, [u, We], [a, g]],
          [
            /\b(mz60\d|xoom[2 ]{0,2}) build\//i
          ],
          [n, [u, We], [a, w]],
          [
            // LG
            /((?=lg)?[vl]k\-?\d{3}) bui| 3\.[-\w; ]{10}lg?-([06cv9]{3,4})/i
          ],
          [n, [u, Ae], [a, w]],
          [
            /(lm(?:-?f100[nv]?|-[\w\.]+)(?= bui|\))|nexus [45])/i,
            /\blg[-e;\/ ]+((?!browser|netcast|android tv|watch)\w+)/i,
            /\blg-?([\d\w]+) bui/i
          ],
          [n, [u, Ae], [a, g]],
          [
            // Lenovo
            /(ideatab[-\w ]+|602lv|d-42a|a101lv|a2109a|a3500-hv|s[56]000|pb-6505[my]|tb-?x?\d{3,4}(?:f[cu]|xu|[av])|yt\d?-[jx]?\d+[lfmx])( bui|;|\)|\/)/i,
            /lenovo ?(b[68]0[08]0-?[hf]?|tab(?:[\w- ]+?)|tb[\w-]{6,7})( bui|;|\)|\/)/i
          ],
          [n, [u, nt], [a, w]],
          [
            // Nokia
            /(nokia) (t[12][01])/i
          ],
          [u, n, [a, w]],
          [
            /(?:maemo|nokia).*(n900|lumia \d+|rm-\d+)/i,
            /nokia[-_ ]?(([-\w\. ]*))/i
          ],
          [[n, /_/g, " "], [a, g], [u, "Nokia"]],
          [
            // Google
            /(pixel (c|tablet))\b/i
            // Google Pixel C/Tablet
          ],
          [n, [u, Oe], [a, w]],
          [
            /droid.+; (pixel[\daxl ]{0,6})(?: bui|\))/i
            // Google Pixel
          ],
          [n, [u, Oe], [a, g]],
          [
            // Sony
            /droid.+; (a?\d[0-2]{2}so|[c-g]\d{4}|so[-gl]\w+|xq-a\w[4-7][12])(?= bui|\).+chrome\/(?![1-6]{0,1}\d\.))/i
          ],
          [n, [u, be], [a, g]],
          [
            /sony tablet [ps]/i,
            /\b(?:sony)?sgp\w+(?: bui|\))/i
          ],
          [[n, "Xperia Tablet"], [u, be], [a, w]],
          [
            // OnePlus
            / (kb2005|in20[12]5|be20[12][59])\b/i,
            /(?:one)?(?:plus)? (a\d0\d\d)(?: b|\))/i
          ],
          [n, [u, Ve], [a, g]],
          [
            // Amazon
            /(alexa)webm/i,
            /(kf[a-z]{2}wi|aeo(?!bc)\w\w)( bui|\))/i,
            // Kindle Fire without Silk / Echo Show
            /(kf[a-z]+)( bui|\)).+silk\//i
            // Kindle Fire HD
          ],
          [n, [u, j], [a, w]],
          [
            /((?:sd|kf)[0349hijorstuw]+)( bui|\)).+silk\//i
            // Fire Phone
          ],
          [[n, /(.+)/g, "Fire Phone $1"], [u, j], [a, g]],
          [
            // BlackBerry
            /(playbook);[-\w\),; ]+(rim)/i
            // BlackBerry PlayBook
          ],
          [n, u, [a, w]],
          [
            /\b((?:bb[a-f]|st[hv])100-\d)/i,
            /\(bb10; (\w+)/i
            // BlackBerry 10
          ],
          [n, [u, it], [a, g]],
          [
            // Asus
            /(?:\b|asus_)(transfo[prime ]{4,10} \w+|eeepc|slider \w+|nexus 7|padfone|p00[cj])/i
          ],
          [n, [u, tt], [a, w]],
          [
            / (z[bes]6[027][012][km][ls]|zenfone \d\w?)\b/i
          ],
          [n, [u, tt], [a, g]],
          [
            // HTC
            /(nexus 9)/i
            // HTC Nexus 9
          ],
          [n, [u, "HTC"], [a, w]],
          [
            /(htc)[-;_ ]{1,2}([\w ]+(?=\)| bui)|\w+)/i,
            // HTC
            // ZTE
            /(zte)[- ]([\w ]+?)(?: bui|\/|\))/i,
            /(alcatel|geeksphone|nexian|panasonic(?!(?:;|\.))|sony(?!-bra))[-_ ]?([-\w]*)/i
            // Alcatel/GeeksPhone/Nexian/Panasonic/Sony
          ],
          [u, [n, /_/g, " "], [a, g]],
          [
            // TCL
            /droid [\w\.]+; ((?:8[14]9[16]|9(?:0(?:48|60|8[01])|1(?:3[27]|66)|2(?:6[69]|9[56])|466))[gqswx])\w*(\)| bui)/i
          ],
          [n, [u, "TCL"], [a, w]],
          [
            // itel
            /(itel) ((\w+))/i
          ],
          [[u, O], n, [a, je, { tablet: ["p10001l", "w7001"], "*": "mobile" }]],
          [
            // Acer
            /droid.+; ([ab][1-7]-?[0178a]\d\d?)/i
          ],
          [n, [u, "Acer"], [a, w]],
          [
            // Meizu
            /droid.+; (m[1-5] note) bui/i,
            /\bmz-([-\w]{2,})/i
          ],
          [n, [u, "Meizu"], [a, g]],
          [
            // Ulefone
            /; ((?:power )?armor(?:[\w ]{0,8}))(?: bui|\))/i
          ],
          [n, [u, "Ulefone"], [a, g]],
          [
            // Energizer
            /; (energy ?\w+)(?: bui|\))/i,
            /; energizer ([\w ]+)(?: bui|\))/i
          ],
          [n, [u, "Energizer"], [a, g]],
          [
            // Cat
            /; cat (b35);/i,
            /; (b15q?|s22 flip|s48c|s62 pro)(?: bui|\))/i
          ],
          [n, [u, "Cat"], [a, g]],
          [
            // Smartfren
            /((?:new )?andromax[\w- ]+)(?: bui|\))/i
          ],
          [n, [u, "Smartfren"], [a, g]],
          [
            // Nothing
            /droid.+; (a(?:015|06[35]|142p?))/i
          ],
          [n, [u, "Nothing"], [a, g]],
          [
            // Archos
            /; (x67 5g|tikeasy \w+|ac[1789]\d\w+)( b|\))/i,
            /archos ?(5|gamepad2?|([\w ]*[t1789]|hello) ?\d+[\w ]*)( b|\))/i
          ],
          [n, [u, "Archos"], [a, w]],
          [
            /archos ([\w ]+)( b|\))/i,
            /; (ac[3-6]\d\w{2,8})( b|\))/i
          ],
          [n, [u, "Archos"], [a, g]],
          [
            // MIXED
            /(imo) (tab \w+)/i,
            // IMO
            /(infinix) (x1101b?)/i
            // Infinix XPad
          ],
          [u, n, [a, w]],
          [
            /(blackberry|benq|palm(?=\-)|sonyericsson|acer|asus(?! zenw)|dell|jolla|meizu|motorola|polytron|infinix|tecno|micromax|advan)[-_ ]?([-\w]*)/i,
            // BlackBerry/BenQ/Palm/Sony-Ericsson/Acer/Asus/Dell/Meizu/Motorola/Polytron/Infinix/Tecno/Micromax/Advan
            /; (hmd|imo) ([\w ]+?)(?: bui|\))/i,
            // HMD/IMO
            /(hp) ([\w ]+\w)/i,
            // HP iPAQ
            /(microsoft); (lumia[\w ]+)/i,
            // Microsoft Lumia
            /(lenovo)[-_ ]?([-\w ]+?)(?: bui|\)|\/)/i,
            // Lenovo
            /(oppo) ?([\w ]+) bui/i
            // OPPO
          ],
          [u, n, [a, g]],
          [
            /(kobo)\s(ereader|touch)/i,
            // Kobo
            /(hp).+(touchpad(?!.+tablet)|tablet)/i,
            // HP TouchPad
            /(kindle)\/([\w\.]+)/i,
            // Kindle
            /(nook)[\w ]+build\/(\w+)/i,
            // Nook
            /(dell) (strea[kpr\d ]*[\dko])/i,
            // Dell Streak
            /(le[- ]+pan)[- ]+(\w{1,9}) bui/i,
            // Le Pan Tablets
            /(trinity)[- ]*(t\d{3}) bui/i,
            // Trinity Tablets
            /(gigaset)[- ]+(q\w{1,9}) bui/i,
            // Gigaset Tablets
            /(vodafone) ([\w ]+)(?:\)| bui)/i
            // Vodafone
          ],
          [u, n, [a, w]],
          [
            /(surface duo)/i
            // Surface Duo
          ],
          [n, [u, Ie], [a, w]],
          [
            /droid [\d\.]+; (fp\du?)(?: b|\))/i
            // Fairphone
          ],
          [n, [u, "Fairphone"], [a, g]],
          [
            /(u304aa)/i
            // AT&T
          ],
          [n, [u, "AT&T"], [a, g]],
          [
            /\bsie-(\w*)/i
            // Siemens
          ],
          [n, [u, "Siemens"], [a, g]],
          [
            /\b(rct\w+) b/i
            // RCA Tablets
          ],
          [n, [u, "RCA"], [a, w]],
          [
            /\b(venue[\d ]{2,7}) b/i
            // Dell Venue Tablets
          ],
          [n, [u, "Dell"], [a, w]],
          [
            /\b(q(?:mv|ta)\w+) b/i
            // Verizon Tablet
          ],
          [n, [u, "Verizon"], [a, w]],
          [
            /\b(?:barnes[& ]+noble |bn[rt])([\w\+ ]*) b/i
            // Barnes & Noble Tablet
          ],
          [n, [u, "Barnes & Noble"], [a, w]],
          [
            /\b(tm\d{3}\w+) b/i
          ],
          [n, [u, "NuVision"], [a, w]],
          [
            /\b(k88) b/i
            // ZTE K Series Tablet
          ],
          [n, [u, "ZTE"], [a, w]],
          [
            /\b(nx\d{3}j) b/i
            // ZTE Nubia
          ],
          [n, [u, "ZTE"], [a, g]],
          [
            /\b(gen\d{3}) b.+49h/i
            // Swiss GEN Mobile
          ],
          [n, [u, "Swiss"], [a, g]],
          [
            /\b(zur\d{3}) b/i
            // Swiss ZUR Tablet
          ],
          [n, [u, "Swiss"], [a, w]],
          [
            /\b((zeki)?tb.*\b) b/i
            // Zeki Tablets
          ],
          [n, [u, "Zeki"], [a, w]],
          [
            /\b([yr]\d{2}) b/i,
            /\b(dragon[- ]+touch |dt)(\w{5}) b/i
            // Dragon Touch Tablet
          ],
          [[u, "Dragon Touch"], n, [a, w]],
          [
            /\b(ns-?\w{0,9}) b/i
            // Insignia Tablets
          ],
          [n, [u, "Insignia"], [a, w]],
          [
            /\b((nxa|next)-?\w{0,9}) b/i
            // NextBook Tablets
          ],
          [n, [u, "NextBook"], [a, w]],
          [
            /\b(xtreme\_)?(v(1[045]|2[015]|[3469]0|7[05])) b/i
            // Voice Xtreme Phones
          ],
          [[u, "Voice"], n, [a, g]],
          [
            /\b(lvtel\-)?(v1[12]) b/i
            // LvTel Phones
          ],
          [[u, "LvTel"], n, [a, g]],
          [
            /\b(ph-1) /i
            // Essential PH-1
          ],
          [n, [u, "Essential"], [a, g]],
          [
            /\b(v(100md|700na|7011|917g).*\b) b/i
            // Envizen Tablets
          ],
          [n, [u, "Envizen"], [a, w]],
          [
            /\b(trio[-\w\. ]+) b/i
            // MachSpeed Tablets
          ],
          [n, [u, "MachSpeed"], [a, w]],
          [
            /\btu_(1491) b/i
            // Rotor Tablets
          ],
          [n, [u, "Rotor"], [a, w]],
          [
            /((?:tegranote|shield t(?!.+d tv))[\w- ]*?)(?: b|\))/i
            // Nvidia Tablets
          ],
          [n, [u, Ke], [a, w]],
          [
            /(sprint) (\w+)/i
            // Sprint Phones
          ],
          [u, n, [a, g]],
          [
            /(kin\.[onetw]{3})/i
            // Microsoft Kin
          ],
          [[n, /\./g, " "], [u, Ie], [a, g]],
          [
            /droid.+; (cc6666?|et5[16]|mc[239][23]x?|vc8[03]x?)\)/i
            // Zebra
          ],
          [n, [u, Me], [a, w]],
          [
            /droid.+; (ec30|ps20|tc[2-8]\d[kx])\)/i
          ],
          [n, [u, Me], [a, g]],
          [
            ///////////////////
            // SMARTTVS
            ///////////////////
            /smart-tv.+(samsung)/i
            // Samsung
          ],
          [u, [a, L]],
          [
            /hbbtv.+maple;(\d+)/i
          ],
          [[n, /^/, "SmartTV"], [u, Ce], [a, L]],
          [
            /(nux; netcast.+smarttv|lg (netcast\.tv-201\d|android tv))/i
            // LG SmartTV
          ],
          [[u, Ae], [a, L]],
          [
            /(apple) ?tv/i
            // Apple TV
          ],
          [u, [n, ue + " TV"], [a, L]],
          [
            /crkey/i
            // Google Chromecast
          ],
          [[n, G + "cast"], [u, Oe], [a, L]],
          [
            /droid.+aft(\w+)( bui|\))/i
            // Fire TV
          ],
          [n, [u, j], [a, L]],
          [
            /(shield \w+ tv)/i
            // Nvidia Shield TV
          ],
          [n, [u, Ke], [a, L]],
          [
            /\(dtv[\);].+(aquos)/i,
            /(aquos-tv[\w ]+)\)/i
            // Sharp
          ],
          [n, [u, ot], [a, L]],
          [
            /(bravia[\w ]+)( bui|\))/i
            // Sony
          ],
          [n, [u, be], [a, L]],
          [
            /(mi(tv|box)-?\w+) bui/i
            // Xiaomi
          ],
          [n, [u, $e], [a, L]],
          [
            /Hbbtv.*(technisat) (.*);/i
            // TechniSAT
          ],
          [u, n, [a, L]],
          [
            /\b(roku)[\dx]*[\)\/]((?:dvp-)?[\d\.]*)/i,
            // Roku
            /hbbtv\/\d+\.\d+\.\d+ +\([\w\+ ]*; *([\w\d][^;]*);([^;]*)/i
            // HbbTV devices
          ],
          [[u, P], [n, P], [a, L]],
          [
            // SmartTV from Unidentified Vendors
            /droid.+; ([\w- ]+) (?:android tv|smart[- ]?tv)/i
          ],
          [n, [a, L]],
          [
            /\b(android tv|smart[- ]?tv|opera tv|tv; rv:)\b/i
          ],
          [[a, L]],
          [
            ///////////////////
            // CONSOLES
            ///////////////////
            /(ouya)/i,
            // Ouya
            /(nintendo) ([wids3utch]+)/i
            // Nintendo
          ],
          [u, n, [a, $]],
          [
            /droid.+; (shield)( bui|\))/i
            // Nvidia Portable
          ],
          [n, [u, Ke], [a, $]],
          [
            /(playstation \w+)/i
            // Playstation
          ],
          [n, [u, be], [a, $]],
          [
            /\b(xbox(?: one)?(?!; xbox))[\); ]/i
            // Microsoft Xbox
          ],
          [n, [u, Ie], [a, $]],
          [
            ///////////////////
            // WEARABLES
            ///////////////////
            /\b(sm-[lr]\d\d[0156][fnuw]?s?|gear live)\b/i
            // Samsung Galaxy Watch
          ],
          [n, [u, Ce], [a, F]],
          [
            /((pebble))app/i,
            // Pebble
            /(asus|google|lg|oppo) ((pixel |zen)?watch[\w ]*)( bui|\))/i
            // Asus ZenWatch / LG Watch / Pixel Watch
          ],
          [u, n, [a, F]],
          [
            /(ow(?:19|20)?we?[1-3]{1,3})/i
            // Oppo Watch
          ],
          [n, [u, qe], [a, F]],
          [
            /(watch)(?: ?os[,\/]|\d,\d\/)[\d\.]+/i
            // Apple Watch
          ],
          [n, [u, ue], [a, F]],
          [
            /(opwwe\d{3})/i
            // OnePlus Watch
          ],
          [n, [u, Ve], [a, F]],
          [
            /(moto 360)/i
            // Motorola 360
          ],
          [n, [u, We], [a, F]],
          [
            /(smartwatch 3)/i
            // Sony SmartWatch
          ],
          [n, [u, be], [a, F]],
          [
            /(g watch r)/i
            // LG G Watch R
          ],
          [n, [u, Ae], [a, F]],
          [
            /droid.+; (wt63?0{2,3})\)/i
          ],
          [n, [u, Me], [a, F]],
          [
            ///////////////////
            // XR
            ///////////////////
            /droid.+; (glass) \d/i
            // Google Glass
          ],
          [n, [u, Oe], [a, F]],
          [
            /(pico) (4|neo3(?: link|pro)?)/i
            // Pico
          ],
          [u, n, [a, F]],
          [
            /; (quest( \d| pro)?)/i
            // Oculus Quest
          ],
          [n, [u, Ee], [a, F]],
          [
            ///////////////////
            // EMBEDDED
            ///////////////////
            /(tesla)(?: qtcarbrowser|\/[-\w\.]+)/i
            // Tesla
          ],
          [u, [a, le]],
          [
            /(aeobc)\b/i
            // Echo Dot
          ],
          [n, [u, j], [a, le]],
          [
            /(homepod).+mac os/i
            // Apple HomePod
          ],
          [n, [u, ue], [a, le]],
          [
            /windows iot/i
          ],
          [[a, le]],
          [
            ////////////////////
            // MIXED (GENERIC)
            ///////////////////
            /droid .+?; ([^;]+?)(?: bui|; wv\)|\) applew).+? mobile safari/i
            // Android Phones from Unidentified Vendors
          ],
          [n, [a, g]],
          [
            /droid .+?; ([^;]+?)(?: bui|\) applew).+?(?! mobile) safari/i
            // Android Tablets from Unidentified Vendors
          ],
          [n, [a, w]],
          [
            /\b((tablet|tab)[;\/]|focus\/\d(?!.+mobile))/i
            // Unidentifiable Tablet
          ],
          [[a, w]],
          [
            /(phone|mobile(?:[;\/]| [ \w\/\.]*safari)|pda(?=.+windows ce))/i
            // Unidentifiable Mobile
          ],
          [[a, g]],
          [
            /droid .+?; ([\w\. -]+)( bui|\))/i
            // Generic Android Device
          ],
          [n, [u, "Generic"]]
        ],
        engine: [
          [
            /windows.+ edge\/([\w\.]+)/i
            // EdgeHTML
          ],
          [h, [l, $t + "HTML"]],
          [
            /(arkweb)\/([\w\.]+)/i
            // ArkWeb
          ],
          [l, h],
          [
            /webkit\/537\.36.+chrome\/(?!27)([\w\.]+)/i
            // Blink
          ],
          [h, [l, "Blink"]],
          [
            /(presto)\/([\w\.]+)/i,
            // Presto
            /(webkit|trident|netfront|netsurf|amaya|lynx|w3m|goanna|servo)\/([\w\.]+)/i,
            // WebKit/Trident/NetFront/NetSurf/Amaya/Lynx/w3m/Goanna/Servo
            /ekioh(flow)\/([\w\.]+)/i,
            // Flow
            /(khtml|tasman|links)[\/ ]\(?([\w\.]+)/i,
            // KHTML/Tasman/Links
            /(icab)[\/ ]([23]\.[\d\.]+)/i,
            // iCab
            /\b(libweb)/i
            // LibWeb
          ],
          [l, h],
          [
            /ladybird\//i
          ],
          [[l, "LibWeb"]],
          [
            /rv\:([\w\.]{1,9})\b.+(gecko)/i
            // Gecko
          ],
          [h, l]
        ],
        os: [
          [
            // Windows
            /microsoft (windows) (vista|xp)/i
            // Windows (iTunes)
          ],
          [l, h],
          [
            /(windows (?:phone(?: os)?|mobile|iot))[\/ ]?([\d\.\w ]*)/i
            // Windows Phone
          ],
          [l, [h, je, Qt]],
          [
            /windows nt 6\.2; (arm)/i,
            // Windows RT
            /windows[\/ ]([ntce\d\. ]+\w)(?!.+xbox)/i,
            /(?:win(?=3|9|n)|win 9x )([nt\d\.]+)/i
          ],
          [[h, je, Qt], [l, "Windows"]],
          [
            // iOS/macOS
            /[adehimnop]{4,7}\b(?:.*os ([\w]+) like mac|; opera)/i,
            // iOS
            /(?:ios;fbsv\/|iphone.+ios[\/ ])([\d\.]+)/i,
            /cfnetwork\/.+darwin/i
          ],
          [[h, /_/g, "."], [l, "iOS"]],
          [
            /(mac os x) ?([\w\. ]*)/i,
            /(macintosh|mac_powerpc\b)(?!.+haiku)/i
            // Mac OS
          ],
          [[l, He], [h, /_/g, "."]],
          [
            // Mobile OSes
            /droid ([\w\.]+)\b.+(android[- ]x86|harmonyos)/i
            // Android-x86/HarmonyOS
          ],
          [h, l],
          [
            /(ubuntu) ([\w\.]+) like android/i
            // Ubuntu Touch
          ],
          [[l, /(.+)/, "$1 Touch"], h],
          [
            // Android/Blackberry/WebOS/QNX/Bada/RIM/KaiOS/Maemo/MeeGo/S40/Sailfish OS/OpenHarmony/Tizen
            /(android|bada|blackberry|kaios|maemo|meego|openharmony|qnx|rim tablet os|sailfish|series40|symbian|tizen|webos)\w*[-\/; ]?([\d\.]*)/i
          ],
          [l, h],
          [
            /\(bb(10);/i
            // BlackBerry 10
          ],
          [h, [l, it]],
          [
            /(?:symbian ?os|symbos|s60(?=;)|series ?60)[-\/ ]?([\w\.]*)/i
            // Symbian
          ],
          [h, [l, "Symbian"]],
          [
            /mozilla\/[\d\.]+ \((?:mobile|tablet|tv|mobile; [\w ]+); rv:.+ gecko\/([\w\.]+)/i
            // Firefox OS
          ],
          [h, [l, Re + " OS"]],
          [
            /web0s;.+rt(tv)/i,
            /\b(?:hp)?wos(?:browser)?\/([\w\.]+)/i
            // WebOS
          ],
          [h, [l, "webOS"]],
          [
            /watch(?: ?os[,\/]|\d,\d\/)([\d\.]+)/i
            // watchOS
          ],
          [h, [l, "watchOS"]],
          [
            // Google Chromecast
            /crkey\/([\d\.]+)/i
            // Google Chromecast
          ],
          [h, [l, G + "cast"]],
          [
            /(cros) [\w]+(?:\)| ([\w\.]+)\b)/i
            // Chromium OS
          ],
          [[l, ve], h],
          [
            // Smart TVs
            /panasonic;(viera)/i,
            // Panasonic Viera
            /(netrange)mmh/i,
            // Netrange
            /(nettv)\/(\d+\.[\w\.]+)/i,
            // NetTV
            // Console
            /(nintendo|playstation) ([wids345portablevuch]+)/i,
            // Nintendo/Playstation
            /(xbox); +xbox ([^\);]+)/i,
            // Microsoft Xbox (360, One, X, S, Series X, Series S)
            // Other
            /\b(joli|palm)\b ?(?:os)?\/?([\w\.]*)/i,
            // Joli/Palm
            /(mint)[\/\(\) ]?(\w*)/i,
            // Mint
            /(mageia|vectorlinux)[; ]/i,
            // Mageia/VectorLinux
            /([kxln]?ubuntu|debian|suse|opensuse|gentoo|arch(?= linux)|slackware|fedora|mandriva|centos|pclinuxos|red ?hat|zenwalk|linpus|raspbian|plan 9|minix|risc os|contiki|deepin|manjaro|elementary os|sabayon|linspire)(?: gnu\/linux)?(?: enterprise)?(?:[- ]linux)?(?:-gnu)?[-\/ ]?(?!chrom|package)([-\w\.]*)/i,
            // Ubuntu/Debian/SUSE/Gentoo/Arch/Slackware/Fedora/Mandriva/CentOS/PCLinuxOS/RedHat/Zenwalk/Linpus/Raspbian/Plan9/Minix/RISCOS/Contiki/Deepin/Manjaro/elementary/Sabayon/Linspire
            /(hurd|linux)(?: arm\w*| x86\w*| ?)([\w\.]*)/i,
            // Hurd/Linux
            /(gnu) ?([\w\.]*)/i,
            // GNU
            /\b([-frentopcghs]{0,5}bsd|dragonfly)[\/ ]?(?!amd|[ix346]{1,2}86)([\w\.]*)/i,
            // FreeBSD/NetBSD/OpenBSD/PC-BSD/GhostBSD/DragonFly
            /(haiku) (\w+)/i
            // Haiku
          ],
          [l, h],
          [
            /(sunos) ?([\w\.\d]*)/i
            // Solaris
          ],
          [[l, "Solaris"], h],
          [
            /((?:open)?solaris)[-\/ ]?([\w\.]*)/i,
            // Solaris
            /(aix) ((\d)(?=\.|\)| )[\w\.])*/i,
            // AIX
            /\b(beos|os\/2|amigaos|morphos|openvms|fuchsia|hp-ux|serenityos)/i,
            // BeOS/OS2/AmigaOS/MorphOS/OpenVMS/Fuchsia/HP-UX/SerenityOS
            /(unix) ?([\w\.]*)/i
            // UNIX
          ],
          [l, h]
        ]
      }, X = function(y, E) {
        if (typeof y === v && (E = y, y = r), !(this instanceof X))
          return new X(y, E).getResult();
        var x = typeof i !== c && i.navigator ? i.navigator : r, D = y || (x && x.userAgent ? x.userAgent : o), de = x && x.userAgentData ? x.userAgentData : r, ie = E ? Y(ei, E) : ei, k = x && x.userAgent == D;
        return this.getBrowser = function() {
          var _ = {};
          return _[l] = r, _[h] = r, te.call(_, D, ie.browser), _[m] = R(_[h]), k && x && x.brave && typeof x.brave.isBrave == b && (_[l] = "Brave"), _;
        }, this.getCPU = function() {
          var _ = {};
          return _[A] = r, te.call(_, D, ie.cpu), _;
        }, this.getDevice = function() {
          var _ = {};
          return _[u] = r, _[n] = r, _[a] = r, te.call(_, D, ie.device), k && !_[a] && de && de.mobile && (_[a] = g), k && _[n] == "Macintosh" && x && typeof x.standalone !== c && x.maxTouchPoints && x.maxTouchPoints > 2 && (_[n] = "iPad", _[a] = w), _;
        }, this.getEngine = function() {
          var _ = {};
          return _[l] = r, _[h] = r, te.call(_, D, ie.engine), _;
        }, this.getOS = function() {
          var _ = {};
          return _[l] = r, _[h] = r, te.call(_, D, ie.os), k && !_[l] && de && de.platform && de.platform != "Unknown" && (_[l] = de.platform.replace(/chrome os/i, ve).replace(/macos/i, He)), _;
        }, this.getResult = function() {
          return {
            ua: this.getUA(),
            browser: this.getBrowser(),
            engine: this.getEngine(),
            os: this.getOS(),
            device: this.getDevice(),
            cpu: this.getCPU()
          };
        }, this.getUA = function() {
          return D;
        }, this.setUA = function(_) {
          return D = typeof _ === p && _.length > pe ? P(_, pe) : _, this;
        }, this.setUA(D), this;
      };
      X.VERSION = s, X.BROWSER = f([l, h, m]), X.CPU = f([A]), X.DEVICE = f([n, u, a, $, g, L, w, F, le]), X.ENGINE = X.OS = f([l, h]), t.exports && (e = t.exports = X), e.UAParser = X;
      var Pe = typeof i !== c && (i.jQuery || i.Zepto);
      if (Pe && !Pe.ua) {
        var at = new X();
        Pe.ua = at.getResult(), Pe.ua.get = function() {
          return at.getUA();
        }, Pe.ua.set = function(y) {
          at.setUA(y);
          var E = at.getResult();
          for (var x in E)
            Pe.ua[x] = E[x];
        };
      }
    })(typeof window == "object" ? window : _s);
  })(Xe, Xe.exports)), Xe.exports;
}
var ys = xs();
const Cs = /* @__PURE__ */ gs(ys), Es = new Cs(), Qi = Es.getResult(), ks = (_a = Qi.engine.name) == null ? void 0 : _a.toLowerCase(), fi = Number((_b = Qi.engine.version) == null ? void 0 : _b.split(".")[0]), Ut = {
  "0x0001": "Escape",
  "0x0002": "Digit1",
  "0x0003": "Digit2",
  "0x0004": "Digit3",
  "0x0005": "Digit4",
  "0x0006": "Digit5",
  "0x0007": "Digit6",
  "0x0008": "Digit7",
  "0x0009": "Digit8",
  "0x000A": "Digit9",
  "0x000B": "Digit0",
  "0x000C": "Minus",
  "0x000D": "Equal",
  "0x000E": "Backspace",
  "0x000F": "Tab",
  "0x0010": "KeyQ",
  "0x0011": "KeyW",
  "0x0012": "KeyE",
  "0x0013": "KeyR",
  "0x0014": "KeyT",
  "0x0015": "KeyY",
  "0x0016": "KeyU",
  "0x0017": "KeyI",
  "0x0018": "KeyO",
  "0x0019": "KeyP",
  "0x001A": "BracketLeft",
  "0x001B": "BracketRight",
  "0x001C": "Enter",
  "0x001D": "ControlLeft",
  "0x001E": "KeyA",
  "0x001F": "KeyS",
  "0x0020": "KeyD",
  "0x0021": "KeyF",
  "0x0022": "KeyG",
  "0x0023": "KeyH",
  "0x0024": "KeyJ",
  "0x0025": "KeyK",
  "0x0026": "KeyL",
  "0x0027": "Semicolon",
  "0x0028": "Quote",
  "0x0029": "Backquote",
  "0x002A": "ShiftLeft",
  "0x002B": "Backslash",
  "0x002C": "KeyZ",
  "0x002D": "KeyX",
  "0x002E": "KeyC",
  "0x002F": "KeyV",
  "0x0030": "KeyB",
  "0x0031": "KeyN",
  "0x0032": "KeyM",
  "0x0033": "Comma",
  "0x0034": "Period",
  "0x0035": "Slash",
  "0x0036": "ShiftRight",
  "0x0037": "NumpadMultiply",
  "0x0038": "AltLeft",
  "0x0039": "Space",
  "0x003A": "CapsLock",
  "0x003B": "F1",
  "0x003C": "F2",
  "0x003D": "F3",
  "0x003E": "F4",
  "0x003F": "F5",
  "0x0040": "F6",
  "0x0041": "F7",
  "0x0042": "F8",
  "0x0043": "F9",
  "0x0044": "F10",
  "0x0045": "Pause",
  "0x0046": "ScrollLock",
  "0x0047": "Numpad7",
  "0x0048": "Numpad8",
  "0x0049": "Numpad9",
  "0x004A": "NumpadSubtract",
  "0x004B": "Numpad4",
  "0x004C": "Numpad5",
  "0x004D": "Numpad6",
  "0x004E": "NumpadAdd",
  "0x004F": "Numpad1",
  "0x0050": "Numpad2",
  "0x0051": "Numpad3",
  "0x0052": "Numpad0",
  "0x0053": "NumpadDecimal",
  "0x0056": "IntlBackslash",
  "0x0057": "F11",
  "0x0058": "F12",
  "0x0059": "NumpadEqual",
  "0x0064": "F13",
  "0x0065": "F14",
  "0x0066": "F15",
  "0x0067": "F16",
  "0x0068": "F17",
  "0x0069": "F18",
  "0x006A": "F19",
  "0x006B": "F20",
  "0x006C": "F21",
  "0x006D": "F22",
  "0x006E": "F23",
  "0x0070": "KanaMode",
  "0x0071": "Lang2",
  "0x0072": "Lang1",
  "0x0073": "IntlRo",
  "0x0076": "F24",
  "0x0079": "Convert",
  "0x007B": "NonConvert",
  "0x007D": "IntlYen",
  "0x007E": "NumpadComma",
  "0xE010": "MediaTrackPrevious",
  "0xE019": "MediaTrackNext",
  "0xE01C": "NumpadEnter",
  "0xE01D": "ControlRight",
  "0xE021": "LaunchApp2",
  "0xE022": "MediaPlayPause",
  "0xE024": "MediaStop",
  "0xE032": "BrowserHome",
  "0xE035": "NumpadDivide",
  "0xE037": "PrintScreen",
  "0xE038": "AltRight",
  "0xE045": "NumLock",
  "0xE046": "Pause",
  "0xE047": "Home",
  "0xE048": "ArrowUp",
  "0xE049": "PageUp",
  "0xE04B": "ArrowLeft",
  "0xE04D": "ArrowRight",
  "0xE04F": "End",
  "0xE050": "ArrowDown",
  "0xE051": "PageDown",
  "0xE052": "Insert",
  "0xE053": "Delete",
  "0xE05D": "ContextMenu",
  "0xE05E": "Power",
  "0xE065": "BrowserSearch",
  "0xE066": "BrowserFavorites",
  "0xE067": "BrowserRefresh",
  "0xE068": "BrowserStop",
  "0xE069": "BrowserForward",
  "0xE06A": "BrowserBack",
  "0xE06B": "LaunchApp1",
  "0xE06C": "LaunchMail",
  "0xE06D": "MediaSelect"
}, pi = {
  "0x0077": "Lang4",
  "0x0078": "Lang3",
  "0xE008": "Undo",
  "0xE00A": "Paste",
  "0xE017": "Cut",
  "0xE018": "Copy",
  "0xE020": "AudioVolumeMute",
  "0xE02C": "Eject",
  "0xE02E": "AudioVolumeDown",
  "0xE030": "AudioVolumeUp",
  "0xE03B": "Help",
  "0xE05B": "MetaLeft",
  "0xE05C": "MetaRight",
  "0xE05F": "Sleep",
  "0xE063": "WakeUp"
}, Ss = {
  "0x0054": "PrintScreen",
  "0xE020": "VolumeMute",
  // The documentation says it's 'AudioVolumeMute', but the actual test shows that it's 'VolumeMute'.
  "0xE02E": "VolumeDown",
  "0xE030": "VolumeUp",
  "0xE05B": fi > 117 ? "MetaLeft" : "OSLeft",
  "0xE05C": fi > 117 ? "MetaRight" : "OSRight"
}, Ds = {
  blink: zt({ ...Ut, ...pi }),
  gecko: zt({ ...Ut, ...Ss }),
  webkit: zt({ ...Ut, ...pi })
};
function zt(t) {
  const e = {};
  for (const [i, r] of Object.entries(t))
    e[r] = i;
  return e;
}
const bi = function(t) {
  const e = Ds[ks];
  return parseInt(e[t], 16);
};
var qt = /* @__PURE__ */ ((t) => (t.CTRL_LEFT = "ControlLeft", t.SHIFT_LEFT = "ShiftLeft", t.SHIFT_RIGHT = "ShiftRight", t.ALT_LEFT = "AltLeft", t.CTRL_RIGHT = "ControlRight", t.ALT_RIGHT = "AltRight", t.ControlLeft = "ControlLeft", t.ShiftLeft = "ShiftLeft", t.ShiftRight = "ShiftRight", t.AltLeft = "AltLeft", t.ControlRight = "ControlRight", t.AltRight = "AltRight", t))(qt || {}), Ne = /* @__PURE__ */ ((t) => (t.CAPS_LOCK = "CapsLock", t.NUM_LOCK = "NumLock", t.SCROLL_LOCK = "ScrollLock", t.KANA_MODE = "KanaMode", t.CapsLock = "CapsLock", t.ScrollLock = "ScrollLock", t.NumLock = "NumLock", t.KanaMode = "KanaMode", t))(Ne || {}), he = /* @__PURE__ */ ((t) => (t[t.CTRL_ALT_DEL = 0] = "CTRL_ALT_DEL", t[t.META = 1] = "META", t[t.CTRL_C = 2] = "CTRL_C", t[t.CTRL_V = 3] = "CTRL_V", t))(he || {}), ne = /* @__PURE__ */ ((t) => (t[t.Fit = 1] = "Fit", t[t.Full = 2] = "Full", t[t.Real = 3] = "Real", t[t.Stretch = 4] = "Stretch", t))(ne || {}), Ze = /* @__PURE__ */ ((t) => (t[t.Pixel = 0] = "Pixel", t[t.Line = 1] = "Line", t[t.Page = 2] = "Page", t))(Ze || {});
class Ts {
  constructor(e, i, r) {
    __publicField(this, "username");
    __publicField(this, "password");
    __publicField(this, "destination");
    __publicField(this, "proxyAddress");
    __publicField(this, "webSocketProtocols");
    __publicField(this, "serverDomain");
    __publicField(this, "authToken");
    __publicField(this, "desktopSize");
    __publicField(this, "extensions");
    this.username = e.username, this.password = e.password, this.proxyAddress = i.address, this.authToken = i.authToken, this.destination = r.destination, this.serverDomain = r.serverDomain, this.webSocketProtocols = r.webSocketProtocols ?? [], this.extensions = r.extensions, this.desktopSize = r.desktopSize;
  }
}
class Rs {
  /**
   * Creates a new ConfigBuilder instance.
   */
  constructor() {
    __publicField(this, "username", "");
    __publicField(this, "password", "");
    __publicField(this, "destination", "");
    __publicField(this, "proxyAddress", "");
    __publicField(this, "webSocketProtocols", []);
    __publicField(this, "serverDomain", "");
    __publicField(this, "authToken", "");
    __publicField(this, "desktopSize");
    __publicField(this, "extensions", []);
  }
  /**
   * Optional parameter
   *
   * @param username - The username to use for authentication
   * @returns The builder instance for method chaining
   */
  withUsername(e) {
    return this.username = e, this;
  }
  /**
   * Optional parameter
   *
   * @param password - The password for authentication
   * @returns The builder instance for method chaining
   */
  withPassword(e) {
    return this.password = e, this;
  }
  /**
   * Required parameter
   *
   * @param destination - The destination address to connect to
   * @returns The builder instance for method chaining
   */
  withDestination(e) {
    return this.destination = e, this;
  }
  /**
   * Required parameter
   *
   * @param proxyAddress - The address of the proxy server
   * @returns The builder instance for method chaining
   */
  withProxyAddress(e) {
    return this.proxyAddress = e, this;
  }
  /**
   * Optional parameter
   *
   * @param protocols - The WebSocket subprotocols offered during the opening handshake
   * @returns The builder instance for method chaining
   */
  withWebSocketProtocols(e) {
    return this.webSocketProtocols = [...e], this;
  }
  /**
   * Optional parameter
   *
   * @param serverDomain - The server domain to connect to
   * @returns The builder instance for method chaining
   */
  withServerDomain(e) {
    return this.serverDomain = e, this;
  }
  /**
   * Required parameter
   *
   * @param authToken - JWT token to connect to the proxy
   * @returns The builder instance for method chaining
   */
  withAuthToken(e) {
    return this.authToken = e, this;
  }
  /**
   * Optional parameter
   *
   * @param ext - The extension
   * @returns The builder instance for method chaining
   */
  withExtension(e) {
    return this.extensions.push(e), this;
  }
  /**
   * Optional
   *
   * @param desktopSize - The desktop size configuration object
   * @returns The builder instance for method chaining
   */
  withDesktopSize(e) {
    return this.desktopSize = e, this;
  }
  /**
   * Builds a new Config instance.
   *
   * @throws {Error} If required parameters (destination, proxyAddress, authToken) are not set
   * @returns A new Config instance with the configured values
   */
  build() {
    if (this.destination === "")
      throw new Error("destination has to be specified");
    if (this.proxyAddress === "")
      throw new Error("proxy address has to be specified");
    if (this.authToken === "")
      throw new Error("authentication token has to be specified");
    const e = { username: this.username, password: this.password }, i = { address: this.proxyAddress, authToken: this.authToken }, r = {
      destination: this.destination,
      serverDomain: this.serverDomain,
      webSocketProtocols: this.webSocketProtocols,
      extensions: this.extensions,
      desktopSize: this.desktopSize
    };
    return new Ts(e, i, r);
  }
}
class ke {
  constructor() {
    __publicField(this, "subscribers");
    this.subscribers = [];
  }
  subscribe(e) {
    this.subscribers.push(e);
  }
  publish(e) {
    for (const i of this.subscribers)
      i(e);
  }
}
class Os {
  constructor(e) {
    __publicField(this, "module");
    __publicField(this, "canvas");
    __publicField(this, "keyboardUnicodeMode", false);
    __publicField(this, "backendSupportsUnicodeKeyboardShortcuts");
    __publicField(this, "onRemoteClipboardChanged");
    __publicField(this, "onForceClipboardUpdate");
    __publicField(this, "onCanvasResized");
    __publicField(this, "onWarningCallback");
    __publicField(this, "onClipboardRemoteUpdate");
    __publicField(this, "fileTransferProvider");
    __publicField(this, "cursorHasOverride", false);
    __publicField(this, "lastCursorStyle", "default");
    __publicField(this, "enableClipboard", true);
    __publicField(this, "_autoClipboard", true);
    __publicField(this, "sessionStartedObservable", new ke());
    /// Published when the session ends: shut down, or its run() returned.
    __publicField(this, "sessionEndedObservable", new ke());
    __publicField(this, "resizeObservable", new ke());
    __publicField(this, "session");
    __publicField(this, "modifierKeyPressed", []);
    __publicField(this, "mousePositionObservable", new ke());
    __publicField(this, "changeVisibilityObservable", new ke());
    __publicField(this, "scaleObservable", new ke());
    __publicField(this, "dynamicResizeObservable", new ke());
    this.module = e, M.info("Web bridge initialized.");
  }
  get autoClipboard() {
    return this._autoClipboard;
  }
  // If set to false, the clipboard will not be enabled and the callbacks will not be registered to the Rust side
  setEnableClipboard(e) {
    this.enableClipboard = e;
  }
  // If set to true, automatic clipboard synchronization with the server is enabled.
  //
  // If set to false, then the client must invoke `PublicAPI.saveRemoteClipboardData` and
  // `PublicAPI.sendClipboardData` to write to clipboard and to send clipboard data to the server.
  setEnableAutoClipboard(e) {
    this._autoClipboard = e;
  }
  /// Callback to set the local clipboard content to data received from the remote.
  setOnRemoteClipboardChanged(e) {
    this.onRemoteClipboardChanged = e;
  }
  /// Callback which is called when the remote requests a forced clipboard update (e.g. on
  /// clipboard initialization sequence)
  setOnForceClipboardUpdate(e) {
    this.onForceClipboardUpdate = e;
  }
  /// Callback which is called when the canvas is resized.
  setOnCanvasResized(e) {
    this.onCanvasResized = e;
  }
  /// Callback which is called when the warning event is emitted.
  setOnWarningCallback(e) {
    this.onWarningCallback = e;
  }
  /// Callback which is called when the clipboard remote update event is emitted.
  setOnClipboardRemoteUpdate(e) {
    this.onClipboardRemoteUpdate = e;
  }
  /**
   * Enable file transfer support. Must be called before connect().
   * Implicitly enables clipboard (required for file transfer protocol).
   *
   * @param provider - Protocol-specific file transfer provider (e.g., RdpFileTransferProvider)
   * @returns The same provider, for chaining
   */
  enableFileTransfer(e) {
    var _a2;
    return (_a2 = this.fileTransferProvider) == null ? void 0 : _a2.dispose(), this.fileTransferProvider = e, this.enableClipboard = true, e;
  }
  mouseIn(e) {
    if (!this.session) return;
    this.syncModifier(e);
    const r = [
      [1, 0],
      // left button
      [2, 2],
      // right button
      [4, 1]
      // middle button
    ].filter(([s]) => (e.buttons & s) === 0).map(([, s]) => this.module.DeviceEvent.mouseButtonReleased(s));
    r.length > 0 && this.doTransactionFromDeviceEvents(r);
  }
  mouseOut(e) {
    this.releaseAllInputs();
  }
  focusLost() {
    this.releaseAllInputs();
  }
  sendKeyboardEvent(e) {
    this.sendKeyboard(e);
  }
  shutdown() {
    var _a2;
    const e = this.session;
    this.session = void 0, this.sessionEndedObservable.publish(null), (_a2 = this.fileTransferProvider) == null ? void 0 : _a2.dispose(), e == null ? void 0 : e.shutdown();
  }
  mouseButtonState(e, i, r) {
    r && e.preventDefault();
    const s = i ? this.module.DeviceEvent.mouseButtonPressed : this.module.DeviceEvent.mouseButtonReleased;
    this.doTransactionFromDeviceEvents([s(e.button)]);
  }
  updateMousePosition(e) {
    this.doTransactionFromDeviceEvents([this.module.DeviceEvent.mouseMove(e.x, e.y)]), this.mousePositionObservable.publish(e);
  }
  configBuilder() {
    return new Rs();
  }
  async connect(e) {
    var _a2;
    const i = new this.module.SessionBuilder();
    if (i.proxyAddress(e.proxyAddress), i.webSocketProtocols(e.webSocketProtocols ?? []), i.destination(e.destination), i.serverDomain(e.serverDomain), i.password(e.password), i.authToken(e.authToken), i.username(e.username), i.renderCanvas(this.canvas), i.setCursorStyleCallbackContext(this), i.setCursorStyleCallback(this.setCursorStyleCallback), e.extensions.forEach((o) => {
      i.extension(o);
    }), this.onRemoteClipboardChanged != null && this.enableClipboard && i.remoteClipboardChangedCallback(this.onRemoteClipboardChanged), this.onForceClipboardUpdate != null && this.enableClipboard && i.forceClipboardUpdateCallback(this.onForceClipboardUpdate), this.fileTransferProvider != null && this.enableClipboard)
      for (const o of this.fileTransferProvider.getBuilderExtensions())
        i.extension(o);
    this.onCanvasResized != null && i.canvasResizedCallback(this.onCanvasResized), e.desktopSize != null && i.desktopSize(
      new this.module.DesktopSize(e.desktopSize.width, e.desktopSize.height)
    );
    const r = await i.connect();
    this.session = r, (_a2 = this.fileTransferProvider) == null ? void 0 : _a2.setSession(r), this.resizeObservable.publish({
      desktopSize: r.desktopSize(),
      sessionId: 0
    }), this.sessionStartedObservable.publish(null);
    const s = async () => {
      try {
        return M.info("Starting the session."), await r.run();
      } finally {
        this.session === r && (this.session = void 0, this.sessionEndedObservable.publish(null)), this.setVisibility(false);
      }
    };
    return {
      sessionId: 0,
      initialDesktopSize: r.desktopSize(),
      websocketPort: 0,
      run: s
    };
  }
  sendSpecialCombination(e) {
    switch (e) {
      case he.CTRL_ALT_DEL:
        this.ctrlAltDel();
        break;
      case he.META:
        this.sendMeta();
        break;
      case he.CTRL_C:
        this.sendCtrlC();
        break;
      case he.CTRL_V:
        this.sendCtrlV();
        break;
    }
  }
  rotation_unit_from_wheel_event(e) {
    switch (e.deltaMode) {
      case e.DOM_DELTA_PIXEL:
        return Ze.Pixel;
      case e.DOM_DELTA_LINE:
        return Ze.Line;
      case e.DOM_DELTA_PAGE:
        return Ze.Page;
      default:
        return Ze.Pixel;
    }
  }
  mouseWheel(e) {
    const i = e.deltaY !== 0, r = i ? e.deltaY : e.deltaX, s = this.rotation_unit_from_wheel_event(e);
    this.doTransactionFromDeviceEvents([
      this.module.DeviceEvent.wheelRotations(i, -r, s)
    ]);
  }
  emitWarningEvent(e) {
    var _a2;
    (_a2 = this.onWarningCallback) == null ? void 0 : _a2.call(this, e);
  }
  emitClipboardRemoteUpdateEvent() {
    var _a2;
    (_a2 = this.onClipboardRemoteUpdate) == null ? void 0 : _a2.call(this);
  }
  setVisibility(e) {
    this.changeVisibilityObservable.publish(e);
  }
  setScale(e) {
    this.scaleObservable.publish(e);
  }
  setCanvas(e) {
    this.canvas = e;
  }
  resizeDynamic(e, i, r) {
    var _a2;
    this.dynamicResizeObservable.publish({ width: e, height: i }), (_a2 = this.session) == null ? void 0 : _a2.resize(e, i, r);
  }
  /// Triggered by the browser when local clipboard is updated. Clipboard backend should
  /// cache the content and send it to the server when it is requested.
  onClipboardChanged(e) {
    return (async () => {
      var _a2;
      await ((_a2 = this.session) == null ? void 0 : _a2.onClipboardPaste(e));
    })();
  }
  onClipboardChangedEmpty() {
    return (async () => {
      var _a2;
      await ((_a2 = this.session) == null ? void 0 : _a2.onClipboardPaste(new this.module.ClipboardData()));
    })();
  }
  setKeyboardUnicodeMode(e) {
    this.keyboardUnicodeMode = e;
  }
  setCursorStyleOverride(e) {
    e == null ? (this.canvas.style.cursor = this.lastCursorStyle, this.cursorHasOverride = false) : (this.canvas.style.cursor = e, this.cursorHasOverride = true);
  }
  invokeExtension(e) {
    var _a2;
    (_a2 = this.session) == null ? void 0 : _a2.invokeExtension(e);
  }
  releaseAllInputs() {
    var _a2;
    (_a2 = this.session) == null ? void 0 : _a2.releaseAllInputs();
  }
  supportsUnicodeKeyboardShortcuts() {
    var _a2, _b2;
    return this.backendSupportsUnicodeKeyboardShortcuts !== void 0 ? this.backendSupportsUnicodeKeyboardShortcuts : ((_a2 = this.session) == null ? void 0 : _a2.supportsUnicodeKeyboardShortcuts) ? (this.backendSupportsUnicodeKeyboardShortcuts = (_b2 = this.session) == null ? void 0 : _b2.supportsUnicodeKeyboardShortcuts(), this.backendSupportsUnicodeKeyboardShortcuts) : true;
  }
  sendKeyboard(e) {
    e.preventDefault();
    let i, r;
    e.type === "keydown" ? (i = this.module.DeviceEvent.keyPressed, r = this.module.DeviceEvent.unicodePressed) : e.type === "keyup" && (i = this.module.DeviceEvent.keyReleased, r = this.module.DeviceEvent.unicodeReleased);
    let s = true;
    if (!this.supportsUnicodeKeyboardShortcuts()) {
      for (const b of ["Alt", "Control", "Meta", "AltGraph", "OS"])
        if (e.getModifierState(b)) {
          s = false;
          break;
        }
    }
    const o = e.code in qt, d = e.code in Ne;
    if (o && this.updateModifierKeyState(e), d && this.syncModifier(e), !e.repeat || !o && !d) {
      const b = bi(e.code), c = Number.isNaN(b);
      if (!this.keyboardUnicodeMode && i && !c) {
        this.doTransactionFromDeviceEvents([i(b)]);
        return;
      }
      if (this.keyboardUnicodeMode && r && i) {
        if (["Dead", "Unidentified"].indexOf(e.key) != -1)
          return;
        const v = bi(e.key);
        Number.isNaN(v) && e.key.length === 1 && !o && s ? this.doTransactionFromDeviceEvents([r(e.key)]) : c || this.doTransactionFromDeviceEvents([i(b)]);
        return;
      }
    }
  }
  setCursorStyleCallback(e, i, r, s) {
    let o;
    switch (e) {
      case "hidden": {
        o = "none";
        break;
      }
      case "default": {
        o = "default";
        break;
      }
      case "url": {
        if (i == null || r == null || s == null) {
          console.error("Invalid custom cursor parameters.");
          return;
        }
        const d = new Image();
        d.src = i;
        const b = Math.round(r), c = Math.round(s);
        o = `url(${i}) ${b} ${c}, default`;
        break;
      }
      default: {
        console.error(`Unsupported cursor style: ${e}.`);
        return;
      }
    }
    this.lastCursorStyle = o, this.cursorHasOverride || (this.canvas.style.cursor = o);
  }
  syncModifier(e) {
    var _a2;
    const i = e.getModifierState(Ne.CAPS_LOCK), r = e.getModifierState(Ne.NUM_LOCK), s = e.getModifierState(Ne.SCROLL_LOCK), o = e.getModifierState(Ne.KANA_MODE);
    (_a2 = this.session) == null ? void 0 : _a2.synchronizeLockKeys(
      s,
      r,
      i,
      o
    );
  }
  updateModifierKeyState(e) {
    const i = qt[e.code];
    this.modifierKeyPressed.indexOf(i) === -1 ? this.modifierKeyPressed.push(i) : e.type === "keyup" && this.modifierKeyPressed.splice(this.modifierKeyPressed.indexOf(i), 1);
  }
  doTransactionFromDeviceEvents(e) {
    var _a2;
    const i = new this.module.InputTransaction();
    e.forEach((r) => i.addEvent(r)), (_a2 = this.session) == null ? void 0 : _a2.applyInputs(i);
  }
  ctrlAltDel() {
    const e = parseInt("0x001D", 16), i = parseInt("0x0038", 16), r = parseInt("0xE053", 16);
    this.doTransactionFromDeviceEvents([
      this.module.DeviceEvent.keyPressed(e),
      this.module.DeviceEvent.keyPressed(i),
      this.module.DeviceEvent.keyPressed(r),
      this.module.DeviceEvent.keyReleased(e),
      this.module.DeviceEvent.keyReleased(i),
      this.module.DeviceEvent.keyReleased(r)
    ]);
  }
  sendMeta() {
    const e = parseInt("0xE05B", 16);
    this.doTransactionFromDeviceEvents([
      this.module.DeviceEvent.keyPressed(e),
      this.module.DeviceEvent.keyReleased(e)
    ]);
  }
  sendCtrlC() {
    const e = parseInt("0x001D", 16), i = parseInt("0x002E", 16);
    this.doTransactionFromDeviceEvents([
      this.module.DeviceEvent.keyPressed(e),
      this.module.DeviceEvent.keyPressed(i),
      this.module.DeviceEvent.keyReleased(i),
      this.module.DeviceEvent.keyReleased(e)
    ]);
  }
  sendCtrlV() {
    const e = parseInt("0x001D", 16), i = parseInt("0x002F", 16);
    this.doTransactionFromDeviceEvents([
      this.module.DeviceEvent.keyPressed(e),
      this.module.DeviceEvent.keyPressed(i),
      this.module.DeviceEvent.keyReleased(i),
      this.module.DeviceEvent.keyReleased(e)
    ]);
  }
}
class As {
  constructor(e, i) {
    __publicField(this, "remoteDesktopService");
    __publicField(this, "clipboardService");
    this.remoteDesktopService = e, this.clipboardService = i;
  }
  configBuilder() {
    return this.remoteDesktopService.configBuilder();
  }
  connect(e) {
    return M.info("Initializing connection."), this.remoteDesktopService.connect(e);
  }
  ctrlAltDel() {
    this.remoteDesktopService.sendSpecialCombination(he.CTRL_ALT_DEL);
  }
  metaKey() {
    this.remoteDesktopService.sendSpecialCombination(he.META);
  }
  ctrlC() {
    this.remoteDesktopService.sendSpecialCombination(he.CTRL_C);
  }
  ctrlV() {
    this.remoteDesktopService.sendSpecialCombination(he.CTRL_V);
  }
  setVisibility(e) {
    M.info(`Change component visibility to: ${e}`), this.remoteDesktopService.setVisibility(e);
  }
  setScale(e) {
    this.remoteDesktopService.setScale(e);
  }
  shutdown() {
    this.remoteDesktopService.shutdown();
  }
  setKeyboardUnicodeMode(e) {
    this.remoteDesktopService.setKeyboardUnicodeMode(e);
  }
  setCursorStyleOverride(e) {
    this.remoteDesktopService.setCursorStyleOverride(e);
  }
  resize(e, i, r) {
    this.remoteDesktopService.resizeDynamic(e, i, r);
  }
  setEnableClipboard(e) {
    this.remoteDesktopService.setEnableClipboard(e);
  }
  setEnableAutoClipboard(e) {
    this.remoteDesktopService.setEnableAutoClipboard(e);
  }
  setOnWarningCallback(e) {
    this.remoteDesktopService.setOnWarningCallback(e);
  }
  setOnClipboardRemoteUpdateCallback(e) {
    this.remoteDesktopService.setOnClipboardRemoteUpdate(e);
  }
  async saveRemoteClipboardData() {
    return await this.clipboardService.saveRemoteClipboardData();
  }
  async sendClipboardData() {
    return await this.clipboardService.sendClipboardData();
  }
  setClipboardProvider(e) {
    this.clipboardService.setProvider(e);
  }
  invokeExtension(e) {
    this.remoteDesktopService.invokeExtension(e);
  }
  enableFileTransfer(e) {
    const i = e.onUploadStarted, r = e.onUploadFinished;
    return e.onUploadStarted = () => {
      i == null ? void 0 : i(), this.clipboardService.suppressMonitoring();
    }, e.onUploadFinished = () => {
      this.clipboardService.resumeMonitoring(), r == null ? void 0 : r();
    }, this.remoteDesktopService.enableFileTransfer(e);
  }
  getExposedFunctions() {
    return {
      setVisibility: this.setVisibility.bind(this),
      configBuilder: this.configBuilder.bind(this),
      connect: this.connect.bind(this),
      onWarningCallback: this.setOnWarningCallback.bind(this),
      onClipboardRemoteUpdateCallback: this.setOnClipboardRemoteUpdateCallback.bind(this),
      setScale: this.setScale.bind(this),
      ctrlAltDel: this.ctrlAltDel.bind(this),
      metaKey: this.metaKey.bind(this),
      ctrlC: this.ctrlC.bind(this),
      ctrlV: this.ctrlV.bind(this),
      shutdown: this.shutdown.bind(this),
      setKeyboardUnicodeMode: this.setKeyboardUnicodeMode.bind(this),
      setCursorStyleOverride: this.setCursorStyleOverride.bind(this),
      resize: this.resize.bind(this),
      setEnableClipboard: this.setEnableClipboard.bind(this),
      setEnableAutoClipboard: this.setEnableAutoClipboard.bind(this),
      saveRemoteClipboardData: this.saveRemoteClipboardData.bind(this),
      sendClipboardData: this.sendClipboardData.bind(this),
      invokeExtension: this.invokeExtension.bind(this),
      setClipboardProvider: this.setClipboardProvider.bind(this),
      enableFileTransfer: this.enableFileTransfer.bind(this)
    };
  }
}
var B = /* @__PURE__ */ ((t) => (t[t.Full = 0] = "Full", t[t.TextOnly = 1] = "TextOnly", t[t.TextOnlyServerOnly = 2] = "TextOnlyServerOnly", t[t.None = 3] = "None", t))(B || {}), er = /* @__PURE__ */ ((t) => (t[t.General = 0] = "General", t[t.WrongPassword = 1] = "WrongPassword", t[t.LogonFailure = 2] = "LogonFailure", t[t.AccessDenied = 3] = "AccessDenied", t[t.RDCleanPath = 4] = "RDCleanPath", t[t.ProxyConnect = 5] = "ProxyConnect", t[t.NegotiationFailure = 6] = "NegotiationFailure", t))(er || {});
const $s = 100;
function se(t) {
  throw {
    kind: () => er.General,
    backtrace: () => t
  };
}
class Ms {
  constructor(e, i) {
    __publicField(this, "remoteDesktopService");
    __publicField(this, "module");
    __publicField(this, "ClipboardApiSupported", B.None);
    __publicField(this, "lastClientClipboardItems", {});
    __publicField(this, "lastReceivedClipboardData", {});
    __publicField(this, "lastSentClipboardData", null);
    __publicField(this, "clipboardDataToSave", null);
    __publicField(this, "lastClipboardMonitorLoopError", null);
    // When true, the clipboard monitoring loop skips reading/sending clipboard updates.
    // Used to prevent the monitoring loop from clobbering an active file upload's
    // FormatList with a text/image clipboard update.
    __publicField(this, "monitoringSuppressed", false);
    // The monitoring loop and the clipboard write waiting for focus belong to this component: a page can hold several,
    // and one being destroyed must not stop the others.
    __publicField(this, "disposed", false);
    __publicField(this, "monitoringActive", false);
    __publicField(this, "monitorTimer");
    // Aborting it removes the listener that restarts monitoring once the `clipboard-read` permission is granted.
    __publicField(this, "resumeOnGrant");
    // Only the latest remote clipboard content is written once the window has the focus again.
    __publicField(this, "pendingFocus", null);
    // Set by the host: it reads and writes the clipboard instead of `navigator.clipboard`.
    __publicField(this, "provider", null);
    // Firefox v126 and below does not support `navigator.clipboard.read` and `navigator.clipboard.write`.
    // So, we need to define specific methods to handle text-only clipboard.
    //
    // Also, Firefox v124 and below does not support `navigator.clipboard.readText`.
    // Because of this, we cannot read the data from the clipboard at all.
    __publicField(this, "ffClipboardDataToSave", null);
    this.remoteDesktopService = e, this.module = i;
  }
  /**
   * Suppress clipboard monitoring. While suppressed, the 100ms monitoring
   * loop will skip reading the local clipboard and sending updates to the
   * remote. This prevents the monitor from clobbering a file upload's
   * FormatList announcement with a text/image clipboard update.
   */
  suppressMonitoring() {
    this.monitoringSuppressed = true;
  }
  /**
   * Resume clipboard monitoring after a previous {@link suppressMonitoring} call.
   */
  resumeMonitoring() {
    this.monitoringSuppressed = false;
  }
  /**
   * Stops the monitoring loop and drops the clipboard write waiting for focus, until the next session starts.
   */
  stopMonitoring() {
    var _a2;
    this.monitoringActive = false, (_a2 = this.resumeOnGrant) == null ? void 0 : _a2.abort(), this.resumeOnGrant = void 0, clearTimeout(this.monitorTimer), this.monitorTimer = void 0, this.pendingFocus = null;
  }
  /**
   * For when the component is destroyed: nothing is read from or written to the clipboard anymore.
   */
  dispose() {
    this.disposed = true, this.stopMonitoring();
  }
  /**
   * Uses `provider` for the local clipboard, in automatic mode, whatever the browser's clipboard API supports.
   * Runs after initClipboard (the component is ready only then), so it replaces the callbacks set there.
   */
  setProvider(e) {
    const i = this.provider == null;
    this.provider = e, this.remoteDesktopService.setOnForceClipboardUpdate(this.onForceClipboardUpdate.bind(this)), this.remoteDesktopService.setOnRemoteClipboardChanged(this.onRemoteClipboardChangedProvider.bind(this)), i && (this.remoteDesktopService.sessionEndedObservable.subscribe(() => this.stopMonitoring()), this.remoteDesktopService.sessionStartedObservable.subscribe((r) => {
      this.monitoringActive = !this.disposed, this.scheduleOnMonitorClipboardUpdate();
    }));
  }
  async initClipboard() {
    if (!window.isSecureContext) {
      this.remoteDesktopService.emitWarningEvent("Clipboard is available only in secure contexts (HTTPS).");
      return;
    }
    if (navigator.clipboard != null && (navigator.clipboard.read != null && navigator.clipboard.write != null ? this.ClipboardApiSupported = B.Full : navigator.clipboard.readText != null ? (this.ClipboardApiSupported = B.TextOnly, this.remoteDesktopService.emitWarningEvent(
      "Clipboard is limited to text-only data types due to an outdated browser version!"
    )) : navigator.clipboard.writeText != null && (this.ClipboardApiSupported = B.TextOnlyServerOnly, this.remoteDesktopService.emitWarningEvent(
      "Clipboard reading is not supported and writing is limited to text-only data types due to an outdated browser version!"
    ))), this.ClipboardApiSupported === B.Full)
      try {
        (await navigator.permissions.query({
          name: "clipboard-read"
        })).state === "denied" && (this.ClipboardApiSupported = B.TextOnly);
      } catch {
        if (/AppleWebKit\//.test(navigator.userAgent) && !/Chrome|Chromium|Android/.test(navigator.userAgent))
          this.remoteDesktopService.autoClipboard && (this.ClipboardApiSupported = B.TextOnly);
        else
          try {
            await navigator.clipboard.read();
          } catch {
            this.ClipboardApiSupported = B.TextOnly;
          }
      }
    if (this.ClipboardApiSupported === B.None) {
      this.remoteDesktopService.emitWarningEvent(
        "Clipboard is not supported due to an outdated browser version!"
      );
      return;
    }
    this.disposed || (this.remoteDesktopService.sessionEndedObservable.subscribe(() => this.stopMonitoring()), this.remoteDesktopService.setOnForceClipboardUpdate(this.onForceClipboardUpdate.bind(this)), this.ClipboardApiSupported === B.Full ? this.remoteDesktopService.autoClipboard ? (this.remoteDesktopService.setOnRemoteClipboardChanged(this.onRemoteClipboardChangedAutoMode.bind(this)), this.remoteDesktopService.sessionStartedObservable.subscribe((e) => {
      this.monitoringActive = !this.disposed, this.scheduleOnMonitorClipboardUpdate();
    })) : this.remoteDesktopService.setOnRemoteClipboardChanged(
      this.onRemoteClipboardChangedManualMode.bind(this)
    ) : this.remoteDesktopService.setOnRemoteClipboardChanged(this.ffOnRemoteClipboardChanged.bind(this)));
  }
  // Copies clipboard content received from the server to the local clipboard.
  // Returns the result of the operation. On failure, it additionally raises an error session event.
  async saveRemoteClipboardData() {
    if (this.ClipboardApiSupported !== B.Full)
      return await this.ffSaveRemoteClipboardData();
    this.clipboardDataToSave == null && se("The server did not send the clipboard data.");
    try {
      const e = this.clipboardDataToRecord(this.clipboardDataToSave), i = new ClipboardItem(e);
      await navigator.clipboard.write([i]), this.clipboardDataToSave = null;
    } catch (e) {
      se("Failed to write to the clipboard: " + e);
    }
  }
  // Sends local clipboard's content to the server.
  // Returns the result of the operation. On failure, it additionally raises an error session event.
  async sendClipboardData() {
    if (this.ClipboardApiSupported !== B.Full)
      return await this.ffSendClipboardData();
    const e = await navigator.clipboard.read().catch((s) => {
      se("Failed to read from the clipboard: " + s);
    });
    e.length == 0 && se("The clipboard has no data.");
    const i = e[0];
    i.types.some((s) => s.startsWith("text/") || s.startsWith("image/png")) || se("The clipboard has no data of supported type (text or image).");
    const r = new this.module.ClipboardData();
    for (const s of i.types) {
      const o = s.startsWith("text/"), d = await i.getType(s);
      o ? r.addText(s, await d.text()) : r.addBinary(s, new Uint8Array(await d.arrayBuffer()));
    }
    r.isEmpty() || (this.lastSentClipboardData = r, await this.remoteDesktopService.onClipboardChanged(r));
  }
  scheduleOnMonitorClipboardUpdate() {
    clearTimeout(this.monitorTimer), this.monitorTimer = this.monitoringActive && !this.disposed ? setTimeout(() => {
      this.monitorTimer = void 0, this.provider ? this.onMonitorProvider() : this.onMonitorClipboard();
    }, $s) : void 0;
  }
  runWhenWindowFocused(e) {
    this.disposed || (document.hasFocus() ? Promise.resolve().then(() => this.disposed ? void 0 : e()).catch((i) => console.error("Failed to set client clipboard: " + i)) : this.pendingFocus = e);
  }
  /**
   * Runs the clipboard write that waited for the window to have the focus (the component calls it on focus).
   */
  flushFocused() {
    const e = this.pendingFocus;
    this.pendingFocus = null, e && this.runWhenWindowFocused(e);
  }
  // This function is required to convert `ClipboardData` to an object that can be used
  // with `ClipboardItem` API.
  clipboardDataToRecord(e) {
    const i = {};
    for (const r of e.items()) {
      const s = r.mimeType();
      i[s] = new Blob([r.value()], { type: s });
    }
    return i;
  }
  clipboardDataToClipboardItemsRecord(e) {
    const i = {};
    for (const r of e.items()) {
      const s = r.mimeType();
      i[s] = r.value();
    }
    return i;
  }
  // This callback is required to send initial clipboard state if available.
  async onForceClipboardUpdate() {
    try {
      if (this.disposed)
        return;
      this.lastSentClipboardData ? await this.remoteDesktopService.onClipboardChanged(this.lastSentClipboardData) : await this.remoteDesktopService.onClipboardChangedEmpty();
    } catch (e) {
      console.error("Failed to send initial clipboard state: " + e);
    }
  }
  // This callback is required to update client clipboard state when remote side has changed.
  onRemoteClipboardChangedManualMode(e) {
    this.clipboardDataToSave = e, this.remoteDesktopService.emitClipboardRemoteUpdateEvent();
  }
  // This callback is required to update client clipboard state when remote side has changed.
  onRemoteClipboardChangedAutoMode(e) {
    if (!this.disposed)
      try {
        const i = this.clipboardDataToRecord(e), r = new ClipboardItem(i);
        this.runWhenWindowFocused(() => (this.lastReceivedClipboardData = this.clipboardDataToClipboardItemsRecord(e), navigator.clipboard.write([r])));
      } catch (i) {
        console.error("Failed to set client clipboard: " + i);
      }
  }
  onRemoteClipboardChangedProvider(e) {
    const i = this.provider;
    if (this.disposed || i == null)
      return;
    const r = this.clipboardDataToClipboardItemsRecord(e);
    this.lastReceivedClipboardData = r, i.write(r).catch((s) => console.error("Failed to set client clipboard: " + s));
  }
  // The monitoring loop with a host's provider: it reports only changes, and never the content it was given.
  async onMonitorProvider() {
    var _a2;
    try {
      const e = this.provider;
      if (e == null || this.disposed || !this.monitoringActive || this.monitoringSuppressed || !document.hasFocus())
        return;
      const i = await e.read();
      if (i == null || this.disposed || !this.monitoringActive || this.monitoringSuppressed)
        return;
      const r = new this.module.ClipboardData();
      for (const [s, o] of Object.entries(i))
        s.startsWith("text/") && typeof o == "string" && o !== "" ? r.addText(s, o) : s.startsWith("image/") && o instanceof Uint8Array && o.length > 0 && r.addBinary(s, o);
      r.isEmpty() || (this.lastSentClipboardData = r, await this.remoteDesktopService.onClipboardChanged(r));
    } catch (e) {
      if (e instanceof Error || typeof e == "string") {
        const i = String(e);
        ((_a2 = this.lastClipboardMonitorLoopError) == null ? void 0 : _a2.toString()) !== i && console.error("Clipboard monitoring error: " + i), this.lastClipboardMonitorLoopError = new Error(i);
      }
    } finally {
      this.scheduleOnMonitorClipboardUpdate();
    }
  }
  // Called periodically to monitor clipboard changes
  async onMonitorClipboard() {
    let e = false;
    try {
      if (this.disposed || !this.monitoringActive || this.monitoringSuppressed || !document.hasFocus())
        return;
      const i = await navigator.clipboard.read();
      if (i.length == 0)
        return;
      const r = i[0];
      if (!r.types.some((d) => d.startsWith("text/") || d.startsWith("image/png")))
        return;
      const s = {};
      let o = true;
      for (const d of r.types) {
        const b = d.startsWith("text/"), c = await r.getType(d), v = b ? await c.text() : new Uint8Array(await c.arrayBuffer()), p = b ? function(n, l) {
          return n === l;
        } : function(n, l) {
          return !(n instanceof Uint8Array) || !(l instanceof Uint8Array) ? false : n.length === l.length && n.every((a, u) => a === l[u]);
        }, m = this.lastClientClipboardItems[d];
        p(m, v) || (p(this.lastReceivedClipboardData[d], v) ? this.lastClientClipboardItems[d] = this.lastReceivedClipboardData[d] : o = false), s[d] = v;
      }
      if (!o && !this.disposed && this.monitoringActive && !this.monitoringSuppressed) {
        this.lastClientClipboardItems = s;
        const d = new this.module.ClipboardData();
        Object.entries(s).forEach(([b, c]) => {
          c != null && (b.startsWith("text/") && typeof c == "string" ? d.addText(b, c) : b.startsWith("image/") && c instanceof Uint8Array && d.addBinary(b, c));
        }), d.isEmpty() || (this.lastSentClipboardData = d, await this.remoteDesktopService.onClipboardChanged(d));
      }
    } catch (i) {
      if (i instanceof DOMException && i.name === "NotAllowedError" && document.hasFocus()) {
        const r = await this.queryClipboardReadPermission();
        if ((r == null ? void 0 : r.state) !== "granted") {
          console.warn(`Clipboard monitoring disabled: ${i.message}`), this.remoteDesktopService.setOnRemoteClipboardChanged(
            this.onRemoteClipboardChangedManualMode.bind(this)
          ), r != null && this.resumeMonitoringOnceGranted(r), e = true;
          return;
        }
      }
      i instanceof Error && ((this.lastClipboardMonitorLoopError === null || this.lastClipboardMonitorLoopError.toString() !== i.toString()) && console.error("Clipboard monitoring error: " + i), this.lastClipboardMonitorLoopError = i);
    } finally {
      e || this.scheduleOnMonitorClipboardUpdate();
    }
  }
  // `null` where the Permissions API doesn't know `clipboard-read` (e.g. Firefox).
  async queryClipboardReadPermission() {
    try {
      return await navigator.permissions.query({ name: "clipboard-read" });
    } catch {
      return null;
    }
  }
  // Restarts monitoring when the user grants the permission (e.g. in the site settings), without a page reload.
  resumeMonitoringOnceGranted(e) {
    var _a2;
    (_a2 = this.resumeOnGrant) == null ? void 0 : _a2.abort();
    const i = new AbortController();
    this.resumeOnGrant = i, e.addEventListener(
      "change",
      () => {
        e.state === "granted" && (i.abort(), this.remoteDesktopService.setOnRemoteClipboardChanged(this.onRemoteClipboardChangedAutoMode.bind(this)), this.scheduleOnMonitorClipboardUpdate());
      },
      { signal: i.signal }
    );
  }
  // This function is required to retrieve the text data from the `ClipboardData`.
  ffRetrieveTextData(e) {
    for (const i of e.items())
      if (i.mimeType().startsWith("text/")) {
        const r = i.value();
        if (typeof r == "string") return r;
      }
    return "";
  }
  // Firefox specific function.
  // This callback is required to update client clipboard state when remote side has changed.
  ffOnRemoteClipboardChanged(e) {
    const i = this.ffRetrieveTextData(e);
    i !== "" && (this.ffClipboardDataToSave = i, this.remoteDesktopService.emitClipboardRemoteUpdateEvent());
  }
  // Firefox specific function. We are using text-only clipboard API here.
  //
  // Copies clipboard content received from the server to the local clipboard.
  // Returns the result of the operation. On failure, it additionally raises an error session event.
  async ffSaveRemoteClipboardData() {
    this.ffClipboardDataToSave == null && se("The server did not send the clipboard data.");
    try {
      await navigator.clipboard.writeText(this.ffClipboardDataToSave), this.ffClipboardDataToSave = null;
    } catch (e) {
      se("Failed to write to the clipboard: " + e);
    }
  }
  // Firefox specific function. We are using text-only clipboard API here.
  //
  // Sends local clipboard's content to the server.
  // Returns the result of the operation. On failure, it additionally raises an error session event.
  async ffSendClipboardData() {
    this.ClipboardApiSupported !== B.TextOnly && se("The browser does not support clipboard read.");
    const e = await navigator.clipboard.readText().catch((r) => {
      se("Failed to read from the clipboard: " + r);
    });
    e.length == 0 && se("The clipboard has no data.");
    const i = new this.module.ClipboardData();
    i.addText("text/plain", e), i.isEmpty() || (this.lastSentClipboardData = i, await this.remoteDesktopService.onClipboardChanged(i));
  }
}
var Ls = (t, e) => e(t, true), Ps = (t, e) => e(t, false), Fs = (t) => t.preventDefault(), Ns = /* @__PURE__ */ os('<div class="svelte-1v9cu6x"><div><div class="screen-viewer svelte-1v9cu6x"><canvas id="renderer" tabindex="0" class="svelte-1v9cu6x"></canvas></div></div></div>');
const Us = {
  hash: "svelte-1v9cu6x",
  code: `.screen-wrapper.svelte-1v9cu6x {position:relative;}.capturing-inputs.svelte-1v9cu6x {outline:1px solid rgba(0, 97, 166, 0.7);outline-offset:-1px;}canvas.svelte-1v9cu6x {
        /* Not inline: an inline canvas sits on a text baseline, so its line box runs a few pixels past it. */display:block;width:100%;height:100%;}.svelte-1v9cu6x::selection {background-color:transparent;}.screen-wrapper.hidden.svelte-1v9cu6x {pointer-events:none !important;position:absolute !important;visibility:hidden;height:100%;width:100%;transform:translate(-100%, -100%);}`
};
function tr(t, e) {
  Vi(e, true), us(t, Us);
  let i = dt(e, "scale"), r = dt(e, "verbose"), s = dt(e, "flexcenter"), o = dt(e, "module"), d = Lt(false), b = () => {
    var _a2, _b2;
    return M.info(`
            capturingInputs: ${document.activeElement === p}
            current active element: ${document.activeElement}
        `), ((_b2 = (_a2 = document.activeElement) == null ? void 0 : _a2.shadowRoot) == null ? void 0 : _b2.firstElementChild) === c;
  }, c, v, p, m = Lt(""), n = Lt(""), l = new Os(o()), a = new Ms(l, o()), u = new As(l, a), h = ne.Fit, A = false, $, g;
  function w(f) {
    b() && Ke(f);
  }
  function L() {
    tt(), it(), window.addEventListener("keydown", w, false), window.addEventListener("keyup", w, false), typeof ResizeObserver < "u" && (g = new ResizeObserver(() => G(h)), g.observe(Ve())), window.addEventListener("focus", be), window.addEventListener("blur", $e), document.addEventListener("visibilitychange", Me);
  }
  function F() {
    s() === "true" && (c.style.flexGrow = "", c.style.display = "", c.style.justifyContent = "", c.style.alignItems = "");
  }
  function le(f) {
    s() === "true" && (f ? c.style.flexGrow = "1" : (c.style.flexGrow = "1", c.style.display = "flex", c.style.justifyContent = "center", c.style.alignItems = "center"));
  }
  function pe(f, C, O) {
    let R = `height: ${f}; width: ${C}`;
    R = `${R}; max-height: ${f}; max-width: ${C}; min-height: ${f}; min-width: ${C}`, V(m, Se(R));
  }
  function j(f, C, O) {
    V(n, `height: ${f}; width: ${C}; overflow: ${O}`);
  }
  const ue = (f) => {
    G(i());
  };
  function tt() {
    l.resizeObservable.subscribe((f) => {
      M.info(`Resize canvas to: ${f.desktopSize.width}x${f.desktopSize.height}`), p.width = f.desktopSize.width, p.height = f.desktopSize.height, G(i());
    });
  }
  function it() {
    window.addEventListener("resize", ue), l.scaleObservable.subscribe((f) => {
      M.info("Change scale!"), G(f);
    }), l.dynamicResizeObservable.subscribe((f) => {
      M.info(`Dynamic resize!, width: ${f.width}, height: ${f.height}`);
    }), l.changeVisibilityObservable.subscribe((f) => {
      V(d, Se(f)), f && (j("100%", "100%", "hidden"), clearTimeout($), $ = setTimeout(() => G(i()), 150));
    });
  }
  function Te() {
    G(h);
  }
  function G(f) {
    if (!A && (F(), U(d)))
      switch (f) {
        case "fit":
        case ne.Fit:
          M.info("Size to fit"), h = ne.Fit, i("fit"), Re();
          break;
        case "full":
        case ne.Full:
          M.info("Size to full"), h = ne.Full, $t(), i("full");
          break;
        case "real":
        case ne.Real:
          M.info("Size to real"), h = ne.Real, rt(), i("real");
          break;
        case "stretch":
        case ne.Stretch:
          M.info("Size to stretch"), h = ne.Stretch, Oe(), i("stretch");
          break;
      }
  }
  function $t() {
    const {
      width: f,
      height: C
    } = ee();
    let O = p.width, R = p.height;
    const P = Math.min(f / p.width, C / p.height);
    O = O * P, R = R * P, j(`${C}px`, `${f}px`, "hidden"), O = O > 0 ? O : 0, R = R > 0 ? R : 0, pe(`${R}px`, `${O}px`);
  }
  function Re(f = false) {
    const {
      width: C,
      height: O
    } = ee();
    let R = p.width, P = p.height;
    if (!f || C < p.width || O < p.height) {
      const te = Math.min(C / p.width, O / p.height);
      R = R * te, P = P * te;
    }
    R = R > 0 ? R : 0, P = P > 0 ? P : 0, j("initial", "initial", "hidden"), pe(`${P}px`, `${R}px`), le(false);
  }
  function Oe() {
    const { width: f, height: C } = ee();
    j("100%", "100%", "hidden"), pe(`${Math.max(C, 0)}px`, `${Math.max(f, 0)}px`), le(true);
  }
  function rt() {
    const {
      width: f,
      height: C
    } = ee();
    f < p.width || C < p.height ? j(`${Math.min(C, p.height)}px`, `${Math.min(f, p.width)}px`, "auto") : j("initial", "initial", "initial"), pe(`${p.height}px`, `${p.width}px`), le(false);
  }
  function st(f) {
    const C = p == null ? void 0 : p.getBoundingClientRect(), O = (p == null ? void 0 : p.width) / C.width, R = (p == null ? void 0 : p.height) / C.height, P = {
      x: Math.round((f.clientX - C.left) * O),
      y: Math.round((f.clientY - C.top) * R)
    };
    l.updateMousePosition(P);
  }
  function nt(f, C) {
    l.mouseButtonState(f, C, true);
  }
  function Ae(f) {
    l.mouseWheel(f);
  }
  function Ie(f) {
    p.focus({ preventScroll: true }), l.mouseIn(f);
  }
  function We(f) {
    l.mouseOut(f);
  }
  function Ke(f) {
    return l.sendKeyboardEvent(f), true;
  }
  function Ve() {
    const f = c.getRootNode();
    return f instanceof ShadowRoot ? f.host : c.parentElement ?? c;
  }
  function ee() {
    const f = Ve().getBoundingClientRect();
    if (f.width >= 1 && f.height >= 1)
      return { width: f.width, height: f.height };
    const C = qe();
    return { width: C.x, height: C.y };
  }
  function qe() {
    const f = window, C = document, O = C.documentElement, R = C.getElementsByTagName("body")[0], P = f.innerWidth ?? O.clientWidth ?? R.clientWidth, te = f.innerHeight ?? O.clientHeight ?? R.clientHeight;
    return { x: P, y: te };
  }
  async function Ce() {
    M.info("Start canvas initialization..."), p.width = 800, p.height = 600, l.setCanvas(p), l.setOnCanvasResized(Te), L();
  }
  function ot() {
    let f = {
      irgUserInteraction: u.getExposedFunctions()
    };
    M.info("Component ready"), M.info("Dispatching ready event"), c.dispatchEvent(new CustomEvent("ready", {
      detail: f,
      bubbles: true,
      composed: true
    }));
  }
  function be() {
    a.flushFocused();
  }
  function $e() {
    l.focusLost();
  }
  function Me() {
    document.visibilityState === "hidden" && l.focusLost();
  }
  Zi(async () => {
    if (M.verbose = r() === "true", M.info("Dom ready"), await Ce(), !A) {
      try {
        await a.initClipboard();
      } catch (f) {
        M.error("Clipboard initialization failed: " + f);
      }
      A || ot();
    }
  }), fs(() => {
    A = true, clearTimeout($), g == null ? void 0 : g.disconnect(), a.dispose(), window.removeEventListener("resize", ue), window.removeEventListener("keydown", w, false), window.removeEventListener("keyup", w, false), window.removeEventListener("focus", be), window.removeEventListener("blur", $e), document.removeEventListener("visibilitychange", Me);
  });
  var Ee = Ns(), ve = Ft(Ee);
  let He;
  var Le = Ft(ve), Y = Ft(Le);
  return Y.__mousemove = st, Y.__mousedown = [Ls, nt], Y.__mouseup = [Ps, nt], Y.__contextmenu = [Fs], Nt(Y, (f) => p = f, () => p), Pt(Le), Pt(ve), Nt(ve, (f) => v = f, () => v), Pt(Ee), Nt(Ee, (f) => c = f, () => c), Gr(() => {
    He = cs(ve, 1, `screen-wrapper scale-${i() ?? ""}`, "svelte-1v9cu6x", He, {
      hidden: !U(d),
      "capturing-inputs": b
    }), ui(ve, "style", U(n)), ui(Le, "style", U(m));
  }), ut("mouseleave", Y, (f) => {
    We(f);
  }), ut("mouseenter", Y, (f) => {
    Ie(f);
  }), ut("wheel", Y, Ae), ut("selectstart", Y, (f) => {
    f.preventDefault();
  }), Gi(t, Ee), qi({
    get scale() {
      return i();
    },
    set scale(f) {
      i(f), Ge();
    },
    get verbose() {
      return r();
    },
    set verbose(f) {
      r(f), Ge();
    },
    get flexcenter() {
      return s();
    },
    set flexcenter(f) {
      s(f), Ge();
    },
    get module() {
      return o();
    },
    set module(f) {
      o(f), Ge();
    }
  });
}
ss([
  "mousemove",
  "mousedown",
  "mouseup",
  "contextmenu"
]);
customElements.define("iron-remote-desktop", ms(
  tr,
  {
    scale: {},
    verbose: {},
    flexcenter: {},
    module: {}
  },
  [],
  [],
  false,
  (t) => class extends t {
    constructor() {
      super(), this.attachShadow({ mode: "open", delegatesFocus: true });
    }
  }
));
const zs = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: tr
}, Symbol.toStringTag, { value: "Module" }));
export {
  Ts as Config,
  Rs as ConfigBuilder,
  zs as default
};
