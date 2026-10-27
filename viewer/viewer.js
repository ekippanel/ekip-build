// Ekip Panel önizleme görüntüleyicisi.
// manifest.json'daki öğeleri türüne göre gösterir; panel çerçevesindeyse konum (zaman kodu, nokta, kare,
// sayfa) seçip panele "buraya not ekle" mesajı gönderir. Panelden gelen "seek" / "pins" mesajlarını uygular.
// Dosya adları depodan geldiği için hiçbir veri innerHTML ile basılmaz.
(function () {
  "use strict";

  var LIBS = {
    model: { src: "https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js", module: true },
    lottie: { src: "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js" },
    rive: { src: "https://unpkg.com/@rive-app/canvas@2.21.6/rive.js" },
  };
  var embedded = window.parent && window.parent !== window;
  var state = { manifest: null, prev: null, current: null, compare: false, pinMode: false, pins: [], players: {} };
  var panelOrigin = "";

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function fmtTime(t) {
    t = Math.max(0, Math.floor(t || 0));
    var m = Math.floor(t / 60), s = t % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function loadLib(name) {
    var lib = LIBS[name];
    if (!lib) return Promise.resolve();
    if (lib.promise) return lib.promise;
    lib.promise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = lib.src;
      if (lib.module) s.type = "module";
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Kitaplık yüklenemedi: " + name)); };
      document.head.appendChild(s);
    });
    return lib.promise;
  }
  function safeHttps(url) { return /^https:\/\//i.test(url || "") ? url : null; }

  function embedUrl(url) {
    var u;
    try { u = new URL(url); } catch (e) { return null; }
    var h = u.hostname.replace(/^www\./, "");
    if (h === "youtu.be") return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(u.pathname.slice(1));
    if (h.endsWith("youtube.com")) {
      var v = u.searchParams.get("v") || (u.pathname.match(/\/(shorts|embed)\/([^/?]+)/) || [])[2];
      return v ? "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(v) : null;
    }
    if (h.endsWith("vimeo.com")) {
      var id = (u.pathname.match(/(\d+)/) || [])[1];
      return id ? "https://player.vimeo.com/video/" + id : null;
    }
    if (h.endsWith("sketchfab.com")) {
      var sk = (u.pathname.match(/([0-9a-f]{32})/) || [])[1];
      return sk ? "https://sketchfab.com/models/" + sk + "/embed" : null;
    }
    if (h.endsWith("figma.com")) return "https://www.figma.com/embed?embed_host=ekippanel&url=" + encodeURIComponent(url);
    if (h === "drive.google.com") {
      var d = (u.pathname.match(/\/d\/([^/]+)/) || [])[1] || u.searchParams.get("id");
      return d ? "https://drive.google.com/file/d/" + encodeURIComponent(d) + "/preview" : null;
    }
    if (h === "docs.google.com") return url.replace(/\/(edit|view)([?#].*)?$/, "/preview");
    return null;
  }

  // ------------------------------------------------------------ panel ile mesajlaşma
  function post(msg) {
    if (!embedded) return;
    msg.source = "ekip-preview";
    try { window.parent.postMessage(msg, panelOrigin || "*"); } catch (e) { /* yok */ }
  }
  function sendAnchor(anchor) {
    var it = state.current;
    if (!it) return;
    anchor.original = it.original;
    anchor.item_title = it.title;
    anchor.type = it.type;
    anchor.sha = state.manifest.sha;
    post({ type: "anchor", anchor: anchor });
    setHint("Konum panele gönderildi: " + anchor.label + " · notunu panelde yaz.");
  }
  window.addEventListener("message", function (ev) {
    if (panelOrigin && ev.origin !== panelOrigin) return;
    var m = ev.data || {};
    if (m.source !== "ekip-panel") return;
    if (m.type === "seek" && m.anchor) seek(m.anchor);
    if (m.type === "pins" && Array.isArray(m.pins)) { state.pins = m.pins; renderPins(); }
  });

  function setHint(t) { $("hint").textContent = t || ""; }

  // ------------------------------------------------------------ çizim
  function select(item) {
    state.current = item;
    state.pinMode = false;
    Array.prototype.forEach.call($("items").children, function (b) { b.classList.toggle("active", b.dataset.id === item.id); });
    var stage = $("stage");
    stage.textContent = "";
    state.players = {};
    var prevItem = state.compare && state.prev ? findPrev(item) : null;
    if (prevItem) {
      stage.appendChild(pane("Önceki sürüm", prevItem, "../prev/", true));
      stage.appendChild(pane("Yeni sürüm", item, "", false));
    } else {
      stage.appendChild(pane(null, item, "", false));
    }
    updateBar();
    renderPins();
  }
  function findPrev(item) {
    return (state.prev.items || []).filter(function (p) { return p.original === item.original && p.type === item.type; })[0] || null;
  }
  function pane(label, item, base, isPrev) {
    var box = el("div", { class: "pane" }, [label ? el("div", { class: "pane-label", text: label }) : null]);
    var frame = el("div", { class: "frame" });
    box.appendChild(frame);
    renderItem(frame, item, base, isPrev, box);
    return box;
  }

  function renderItem(frame, item, base, isPrev, box) {
    var src = item.type === "embed" || item.type === "link" ? item.src : base + item.src;
    switch (item.type) {
      case "image": {
        frame.classList.add("scroll");
        var img = el("img", { src: src, alt: item.title });
        img.style.cursor = "zoom-in";
        img.addEventListener("click", function (ev) {
          if (state.pinMode && !isPrev) {
            var r = img.getBoundingClientRect();
            var x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
            sendAnchor({ x: +x.toFixed(4), y: +y.toFixed(4), label: "Nokta (%" + Math.round(x * 100) + ", %" + Math.round(y * 100) + ")" });
            togglePin(false);
            return;
          }
          img.classList.toggle("zoomed");
          img.style.cursor = img.classList.contains("zoomed") ? "zoom-out" : "zoom-in";
          renderPins();
        });
        var wrap = el("div", { style: "position:relative;display:inline-block;margin:auto" }, [img]);
        wrap.appendChild(el("div", { class: "pin-layer" }));
        frame.appendChild(wrap);
        if (!isPrev) state.players.image = { img: img, layer: wrap.lastChild };
        break;
      }
      case "video": {
        var v = el("video", { src: src, controls: "", playsinline: "", preload: "metadata" });
        if (item.poster) v.setAttribute("poster", base + item.poster);
        frame.appendChild(v);
        if (!isPrev) state.players.media = v; else state.players.prevMedia = v;
        if (!isPrev) syncPrev(v);
        break;
      }
      case "audio": {
        var a = el("audio", { src: src, controls: "", preload: "metadata" });
        frame.appendChild(el("div", { class: "audio" }, [el("div", { class: "muted", text: item.title }), a]));
        if (!isPrev) state.players.media = a; else state.players.prevMedia = a;
        break;
      }
      case "model": {
        frame.appendChild(el("p", { class: "muted", text: "3D model yükleniyor…" }));
        loadLib("model").then(function () {
          frame.textContent = "";
          var mv = el("model-viewer", { src: src, "camera-controls": "", "touch-action": "pan-y", ar: "", "shadow-intensity": "1", exposure: "1", alt: item.title });
          mv.addEventListener("click", function (ev) {
            if (!state.pinMode || isPrev || !mv.positionAndNormalFromPoint) return;
            var hit = mv.positionAndNormalFromPoint(ev.clientX, ev.clientY);
            if (!hit) { setHint("Modelin üzerine tıkla."); return; }
            sendAnchor({ position: hit.position.toString(), normal: hit.normal.toString(), label: "3D nokta" });
            togglePin(false);
          });
          frame.appendChild(mv);
          if (!isPrev) { state.players.model = mv; renderPins(); }
        }).catch(function (e) { frame.textContent = e.message; });
        break;
      }
      case "lottie": {
        var holder = el("div", { class: "lottie" });
        var range = el("input", { type: "range", min: "0", max: "100", value: "0" });
        var playBtn = el("button", { class: "btn", text: "Duraklat" });
        var label = el("span", { class: "muted", text: "" });
        frame.appendChild(holder);
        box.appendChild(el("div", { class: "controls" }, [playBtn, range, label]));
        loadLib("lottie").then(function () {
          var anim = window.lottie.loadAnimation({ container: holder, renderer: "svg", loop: true, autoplay: true, path: src });
          anim.addEventListener("DOMLoaded", function () { range.max = String(Math.max(1, Math.floor(anim.totalFrames) - 1)); });
          anim.addEventListener("enterFrame", function () { range.value = String(Math.floor(anim.currentFrame)); label.textContent = "Kare " + Math.floor(anim.currentFrame); });
          range.addEventListener("input", function () { anim.goToAndStop(+range.value, true); playBtn.textContent = "Oynat"; });
          playBtn.addEventListener("click", function () {
            if (anim.isPaused) { anim.play(); playBtn.textContent = "Duraklat"; } else { anim.pause(); playBtn.textContent = "Oynat"; }
          });
          if (!isPrev) state.players.lottie = anim;
        }).catch(function (e) { frame.textContent = e.message; });
        break;
      }
      case "rive": {
        var canvas = el("canvas", { width: "960", height: "540" });
        frame.appendChild(canvas);
        loadLib("rive").then(function () { new window.rive.Rive({ src: src, canvas: canvas, autoplay: true }); })
          .catch(function (e) { frame.textContent = e.message; });
        break;
      }
      case "pdf":
      case "html": {
        frame.appendChild(el("iframe", { src: src, title: item.title, sandbox: item.type === "html" ? "allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock allow-downloads" : "" }));
        box.appendChild(el("div", { class: "controls" }, [el("a", { href: src, target: "_blank", rel: "noopener", text: "Yeni sekmede aç" })]));
        break;
      }
      case "embed": {
        var e = embedUrl(item.src);
        if (e) frame.appendChild(el("iframe", { src: e, title: item.title, allow: "autoplay; fullscreen; xr-spatial-tracking", allowfullscreen: "" }));
        else renderLink(frame, item);
        break;
      }
      default:
        renderLink(frame, item);
    }
  }
  function renderLink(frame, item) {
    var href = safeHttps(item.src);
    frame.appendChild(el("div", { class: "linkcard" }, [
      el("p", { text: item.title }),
      href ? el("a", { href: href, target: "_blank", rel: "noopener noreferrer", text: "Bağlantıyı aç" }) : null,
    ]));
  }
  function syncPrev(v) {
    // Karşılaştırmada önceki video yeni videoyla birlikte oynar
    ["play", "pause", "seeked"].forEach(function (evName) {
      v.addEventListener(evName, function () {
        var p = state.players.prevMedia;
        if (!p) return;
        if (Math.abs(p.currentTime - v.currentTime) > 0.3) p.currentTime = v.currentTime;
        if (evName === "play") p.play().catch(function () {}); else if (evName === "pause") p.pause();
      });
    });
  }

  function updateBar() {
    var it = state.current;
    var t = it ? it.type : "";
    var canPin = t === "image" || t === "model";
    var canAnchor = t === "video" || t === "audio" || t === "lottie" || t === "pdf";
    $("pinMode").hidden = !(embedded && canPin);
    $("anchorBtn").hidden = !(embedded && canAnchor);
    $("pinMode").classList.remove("on");
    if (!embedded) setHint("Not eklemek için bu sayfayı Ekip Panel'deki Test et sayfasından aç.");
    else if (canPin) setHint("Bir noktaya not koymak için \"Noktaya not koy\"a bas, sonra görsele / modele tıkla.");
    else if (canAnchor) setHint("Oynatıcıyı istediğin ana getir, \"Buraya not ekle\"ye bas.");
    else setHint("");
  }
  function togglePin(on) {
    state.pinMode = on === undefined ? !state.pinMode : on;
    $("pinMode").classList.toggle("on", state.pinMode);
    if (state.pinMode) setHint("Şimdi not koymak istediğin noktaya tıkla.");
    else updateBar();
  }

  function seek(anchor) {
    var items = state.manifest.items || [];
    var it = items.filter(function (i) { return i.original === anchor.original; })[0];
    if (!it) return;
    if (!state.current || state.current.id !== it.id) select(it);
    setTimeout(function () {
      var p = state.players;
      if (anchor.t != null && p.media) { p.media.currentTime = +anchor.t; p.media.pause(); }
      if (anchor.frame != null && p.lottie) p.lottie.goToAndStop(+anchor.frame, true);
      if (anchor.position && p.model) {
        p.model.cameraTarget = anchor.position;
        p.model.fieldOfView = "20deg";
      }
      setHint("Not konumu: " + (anchor.label || ""));
    }, 300);
  }

  function renderPins() {
    var it = state.current;
    if (!it) return;
    var mine = state.pins.filter(function (p) { return p.anchor && p.anchor.original === it.original; });
    var ip = state.players.image;
    if (ip) {
      ip.layer.textContent = "";
      mine.forEach(function (p) {
        if (p.anchor.x == null) return;
        var pin = el("div", { class: "pin", style: "left:" + (p.anchor.x * 100) + "%;top:" + (p.anchor.y * 100) + "%" }, [el("span", { text: p.label || "" })]);
        ip.layer.appendChild(pin);
      });
    }
    var mv = state.players.model;
    if (mv) {
      Array.prototype.slice.call(mv.querySelectorAll(".hotspot")).forEach(function (h) { h.remove(); });
      mine.forEach(function (p, i) {
        if (!p.anchor.position) return;
        mv.appendChild(el("button", { class: "hotspot", slot: "hotspot-" + i, "data-position": p.anchor.position, "data-normal": p.anchor.normal || "0m 1m 0m", title: p.label || "", text: "📍" }));
      });
    }
  }

  $("pinMode").addEventListener("click", function () { togglePin(); });
  $("anchorBtn").addEventListener("click", function () {
    var it = state.current, p = state.players;
    if (!it) return;
    if ((it.type === "video" || it.type === "audio") && p.media) {
      sendAnchor({ t: +p.media.currentTime.toFixed(2), label: fmtTime(p.media.currentTime) });
    } else if (it.type === "lottie" && p.lottie) {
      sendAnchor({ frame: Math.floor(p.lottie.currentFrame), label: "Kare " + Math.floor(p.lottie.currentFrame) });
    } else if (it.type === "pdf") {
      var page = window.prompt("Kaçıncı sayfa?", "1");
      if (page && /^\d+$/.test(page)) sendAnchor({ page: +page, label: "Sayfa " + page });
    }
  });
  $("compare").addEventListener("change", function (ev) {
    state.compare = ev.target.checked;
    if (state.current) select(state.current);
  });

  // ------------------------------------------------------------ başlangıç
  fetch("manifest.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (m) {
    state.manifest = m;
    panelOrigin = m.panel_origin || "";
    document.title = (m.title || "Önizleme") + " · önizleme";
    $("title").textContent = m.title || "Önizleme";
    var when = m.built_at ? new Date(m.built_at).toLocaleString("tr-TR") : "";
    $("meta").textContent = [m.sha ? m.sha.slice(0, 7) : "", when, (m.items || []).length + " öğe"].filter(Boolean).join(" · ");
    var nav = $("items");
    (m.items || []).forEach(function (it) {
      var b = el("button", { text: it.title, title: it.original, onclick: function () { select(it); } });
      b.dataset.id = it.id;
      nav.appendChild(b);
    });
    if ((m.items || []).length <= 1) nav.hidden = true;
    if ((m.warnings || []).length) {
      $("warnings").hidden = false;
      m.warnings.forEach(function (w) { $("warnList").appendChild(el("li", { text: w })); });
    }
    if (m.items && m.items.length) select(m.items[0]);
    post({ type: "ready", sha: m.sha, items: (m.items || []).map(function (i) { return { id: i.id, original: i.original, type: i.type, title: i.title }; }) });
    return fetch("../prev/manifest.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }).then(function (prev) {
    if (prev && prev.items && prev.sha !== (state.manifest || {}).sha) {
      state.prev = prev;
      $("compareWrap").hidden = false;
    }
  }).catch(function () {
    $("stage").textContent = "";
    $("stage").appendChild(el("p", { class: "muted center", text: "Önizleme bilgisi okunamadı." }));
  });
})();
