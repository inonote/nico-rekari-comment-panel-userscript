// ==UserScript==
// @name     コメントパネル for Re:仮
// @namespace  https://github.com/inonote/nico-rekari-comment-panel-userscript
// @version    2024-06-17_1
// @description ニコニコ動画 (Re:仮) にコメントパネルを (無理やり) 導入します
// @author     いののて
// @match    https://www.nicovideo.jp/watch_tmp/*
// @icon     https://www.google.com/s2/favicons?sz=64&domain=nicovideo.jp
// @grant    none
// @updateURL    https://github.com/inonote/nico-rekari-comment-panel-userscript/raw/main/nico-rekari-comment-panel.user.js
// @downloadURL  https://github.com/inonote/nico-rekari-comment-panel-userscript/raw/main/nico-rekari-comment-panel.user.js
// @supportURL   https://github.com/inonote/nico-rekari-comment-panel-userscript
// ==/UserScript==

// Copyright (c) 2024 inonote
// Use of this source code is governed by the MIT License
// that can be found at http://opensource.org/licenses/mit-license.php

/**
 * @typedef CommentData
 * @property {string} command
 * @property {string} id
 * @property {string} message
 * @property {string} postedAt
 * @property {number} vposMsec
 * @property {HTMLDivElement} elmItem
 */

(function() {
  "use strict";

  const STYLE_SHEET = `
.nicopane-cmtlst {
  border: 2px solid #dadada;
  width: 100%;
  overflow: scroll;
  position: absolute;
  height: calc(100% - 32px);
  font-size:80%
}

.nicopane-cmtlst-head {
  position: sticky;
  top: 0;
  font-weight: bold;
  background: #f2f2f2;
}

.nicopane-cmtlst-head,
.nicopane-cmtlst-row {
  display: grid;
  grid-template-columns: minmax(180px, auto) 80px 180px;
  width: calc(max(100%, 260px) + 180px);
  user-select: none;
}

.nicopane-cmtlst-row:hover {
  background: #efefef;
}

.nicopane-cmtlst-col {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  padding: 4px 8px;
  border-right: 1px solid #dadada;
}

.nicopane-menu-backdrop {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 10000;
}

.nicopane-menu {
  position: absolute;
  background: #fff;
  border: 1px solid #dadada;
  border-radius: 6px;
  box-shadow: 0px 2px 10px rgba(0, 0, 0, .125);
  padding: 4px 0px;
  font-size: 80%;
  user-select: none;
  z-index: 10001;
}

.nicopane-menu-head {
  font-weight: bold;
  padding-bottom: 2px;
}
  
.nicopane-menu-head,
.nicopane-menu-item {
  padding: 2px 10px;
  white-space: nowrap;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nicopane-menu-item:hover {
  background: #efefef;
}

.nicopane-head {
  display: flex;
  margin: 4px 12px;
  font-size: 92.5%;
}

.nicopane-head > select {
  border-width: revert;
  border-style: revert;
  border-color: revert;
}

.nicopane-head-btn {
  display: inline-block;
  fill: #b2b9c2;
  cursor: pointer;
}
.nicopane-head-btn:hover {
  fill: #c9d1db;
}

.nicopane-icon svg {
  width: 24px;
  height: 24px;
  pointer-events: none;
}

.nicopane-mr-auto {
  margin-right: auto;
}
`;
  
  function iconCommentAutoScroll() { return createSvgElement('<svg width="32" height="32" viewBox="0 0 8.467 8.467" xmlns="http://www.w3.org/2000/svg"><path d="M2.646 1.058v.53H5.82v-.53H2.646zm0 1.059V3.44H5.82V2.117H2.646zm0 1.852v1.058H.794l3.44 2.646 3.439-2.646H5.82V3.97H2.646z" fill-rule="evenodd" paint-order="stroke fill markers"/></svg>'); }
  function iconCommentAutoScrollDisabled() { return createSvgElement('<svg width="32" height="32" viewBox="0 0 8.467 8.467" xmlns="http://www.w3.org/2000/svg"><path d="m3.392.698-.562.56.842.843-.842.841.562.562.841-.842.842.842.561-.562-.841-.841.841-.842-.56-.561-.843.841-.841-.841zm-.746 3.27v1.06H.794l3.44 2.645 3.439-2.646H5.82V3.97H2.646z" fill-rule="evenodd" paint-order="stroke fill markers"/></svg>'); }

  function trackPopupMenu(x, y, items) {
    /*
      items
      [
        [ "item id 0", "header label" ],
        [ "item id 1", "item label 1" ],
        [ "item id 2", "item label 2" ]
      ]
    */

    return new Promise(resolve => {
      let elmBackdrop = createDivElement("nicopane-menu-backdrop");
      document.body.appendChild(elmBackdrop);

      let elmPopup = createDivElement("nicopane-menu");
      elmPopup.style.left = x + "px";
      elmPopup.style.top = y + "px";
      document.body.appendChild(elmPopup);

      let i = 0;
      for(const row of items) {
        if (!row)
          continue;

        let elmItem = createDivElement(i ? "nicopane-menu-item" : "nicopane-menu-head");
        elmItem.innerText = row[1];
        elmPopup.appendChild(elmItem);

        if (i) {
          elmItem.addEventListener("click", () => destruct(row[0]));
        }

        ++i;
      }

      elmBackdrop.addEventListener("mousedown", () => destruct(null));

      if (x + elmPopup.clientWidth + 5 > document.documentElement.clientWidth)
        elmPopup.style.left = (document.documentElement.clientWidth - elmPopup.clientWidth - 5) + "px";

      function destruct(itemId) {
        elmBackdrop.parentElement.removeChild(elmBackdrop);
        elmPopup.parentElement.removeChild(elmPopup);
        resolve(itemId);
      }
    });
  }

  function CommentList() {
    this.elmList = document.createElement("div");
    this.elmList.classList.add("nicopane-cmtlst");
    this.elmVideo = null;
    /**
     * @type {CommentData[]}
     */
    this.comments = [];
    /**
     * @type {CommentData[]}
     */
    this.allComments = [];

    this.isAutoScrollEnabled = true;
  }
  CommentList.prototype = {
    // コメントリスト挿入
    install: function(parentElement) {
      let elmCommentPanelHeader = createDivElement("nicopane-head");

      // 特に意味のないコメント切り替えドロップダウン
      let elmCommentSelector = document.createElement("select");
      let elmCommentSelectorItem = document.createElement("option");
      elmCommentSelectorItem.value = "normal";
      elmCommentSelectorItem.label = "通常コメント";
      elmCommentSelector.appendChild(elmCommentSelectorItem);
      elmCommentSelector.classList.add("nicopane-mr-auto");
      elmCommentSelector.value = "normal";
      elmCommentPanelHeader.appendChild(elmCommentSelector);

      // リスト自動スクロール切り替えボタン
      let elmBtnAutoScroll = createDivElement("nicopane-head-btn nicopane-icon");
      elmBtnAutoScroll.title = "自動スクロール";
      elmBtnAutoScroll.appendChild(iconCommentAutoScroll());
      elmBtnAutoScroll.addEventListener("click", () => {
        this.isAutoScrollEnabled = !this.isAutoScrollEnabled;

        elmBtnAutoScroll.innerHTML = "";
        if (this.isAutoScrollEnabled)
          elmBtnAutoScroll.appendChild(iconCommentAutoScroll());
        else
          elmBtnAutoScroll.appendChild(iconCommentAutoScrollDisabled());
      }, true);
      elmCommentPanelHeader.appendChild(elmBtnAutoScroll);

      parentElement.appendChild(elmCommentPanelHeader);

      parentElement.appendChild(this.elmList);
    },

    // コメントリスト描画 (非効率)
    draw: function() {
      this.elmList.innerHTML = "";
      this.comments.sort((a, b) => a.vposMsec - b.vposMsec);
      const createItemCol = function(text) {
        let elmCol = createDivElement("nicopane-cmtlst-col");
        elmCol.title = text;
        elmCol.innerText = text;
        return elmCol;
      }

      // ヘッダー
      {
        let elmListItem = createDivElement("nicopane-cmtlst-head");
        elmListItem.appendChild(createItemCol("コメント"));
        elmListItem.appendChild(createItemCol("再生時間"));
        elmListItem.appendChild(createItemCol("書込日時"));
        this.elmList.appendChild(elmListItem);
      }

      for(let idx = 0; idx < this.comments.length; ++idx) {
        let commentData = this.comments[idx];
        let elmListItem = createDivElement("nicopane-cmtlst-row");
        elmListItem.appendChild(createItemCol(commentData.message));
        elmListItem.appendChild(createItemCol(mescToTime(commentData.vposMsec)));
        elmListItem.appendChild(createItemCol(new Date(commentData.postedAt).toLocaleString()));

        elmListItem.addEventListener("contextmenu", e => {
          this.onContextMenuListItem(e.pageX, e.pageY, commentData);
          e.preventDefault();
          e.stopPropagation();
        });
        this.elmList.appendChild(elmListItem);
        commentData.elmItem = elmListItem;
      }
    },

    /** @type {(mouseX: number, mouseY: number, commentData: CommentData) => void} */
    onContextMenuListItem: async function(mouseX, mouseY, commentData) {
      // jump は使えない
      //   ニコ動プレイヤーの使用上、currentTime を書き換えるだけでは正常にジャンプできない
      //   対処法調査中

      const retId = await trackPopupMenu(mouseX, mouseY, [
        [ "", commentData.message ],
        [ "copy", "コメントをコピー"],
        // [ "jump", `コメントの再生時間 ${mescToTime(commentData.vposMsec)} に移動` ],
        [ "ng", "コメントをNG登録"]
      ]);

      switch (retId) {
      case "copy": // コメントをコピー
        navigator.clipboard.writeText(commentData.message);
        break;
    
      /* case "jump": // コメントの再生時間に移動
        if (this.elmVideo)
          this.elmVideo.currentTime = commentData.vposMsec / 1000;
        break;*/
      
      case "ng": // コメントをNG登録
        {
          const elmBtnNgConfig = document.getElementById("popover::r0::trigger");
          const elmInput = document.querySelector("#popover\\:\\:r0\\:\\:popper > div > div > div > input");
          const elmBtnAdd = document.querySelector("#popover\\:\\:r0\\:\\:popper > div > div > button:last-of-type");
          if (!elmBtnNgConfig || !elmInput || !elmBtnAdd)
            break;

          // NG設定ボタンを押して...
          elmBtnNgConfig.click();

          // 入力欄にコメント本文を設定して
          let oldValue = elmInput.value;
          elmInput.value = commentData.message;
          if (elmInput._valueTracker)
            elmInput._valueTracker.setValue(oldValue); // Reactで管理されたinputを書き換えるためのハック
          elmInput.dispatchEvent(new Event("input", { bubbles: true } ));

          // 追加ボタンを押して...
          elmBtnAdd.click();

          // もう一度NG設定ボタンを押す (popover非表示)
          elmBtnNgConfig.click();
        }
        break;

      }
    },

    // 再生時間とコメントリストの位置を同期させる
    syncCurrentTime: function(time_) {
      let time = time_;
      if (time === undefined && this.elmVideo)
        time = this.elmVideo.currentTime * 1000;

      for(const x of this.comments) {
        if (time <= x.vposMsec) {
          if (x.elmItem) {
            if (x.elmItem.offsetTop + x.elmItem.clientHeight < this.elmList.scrollTop ||
              x.elmItem.offsetTop > this.elmList.scrollTop + this.elmList.clientHeight) {
              this.elmList.scrollTop = x.elmItem.offsetTop - this.elmList.clientHeight + x.elmItem.clientHeight;
            }
          }
          break;
        }
      }
    },

    startTimeSync: function(elmVideo) {
      this.elmVideo = elmVideo;
      setInterval(() => {
        if (!elmVideo.paused && this.isAutoScrollEnabled)
          this.syncCurrentTime(elmVideo.currentTime * 1000);
      }, 500);
    }
  };

  let commentList = new CommentList;

  async function onFetchApi(url, resp) {
    let ret = false;

    if (/^https:\/\/nvapi.nicovideo.jp\/v1\/tmp\/comments\//.test(url)) {
      ret = await onGetComments(
        url.match(/^https:\/\/nvapi.nicovideo.jp\/v1\/tmp\/comments\/([a-z0-9]*)/)[1],
        await resp.clone().json());
    }
    return ret ? ret : resp;
  }

  /**
   * @param {CommentData[]} comments
   * @param {string[]} ngWords
   * @returns {{message: string}[]}
   */
  function removeNgComments(comments, ngWords) {
    return comments.filter(comment => !ngWords.some(ng => comment.message.includes(ng)));
  }

  /**
   * @returns {string[]}
   */
  function getNgWords() {
    return JSON.parse(localStorage.getItem("niconico-tmp")).data.ngWords.data;
  }

  /**
   * @param {CommentList} list
   */
  function updateCommentList(list) {
    list.comments = removeNgComments(list.allComments, getNgWords());
    list.draw();
    list.syncCurrentTime();
  }

  /**
   * @param {CommentList} list
   * @param {number} milliSeconds
   */
  function updateCommentListOnTimeout(list, milliSeconds) {
    setTimeout(() => updateCommentList(list), milliSeconds);
  }

  async function onGetComments(vidId, resp) {
    console.log("コメント取得: " + vidId);

    switch(resp.meta.status) {
    case 200:
      console.log("コメント件数", resp.data.comments.length);
      commentList.allComments = resp.data.comments;
      commentList.comments = removeNgComments(commentList.allComments, getNgWords());
      commentList.draw();
      return false;

    case 201:
      console.log("コメント追加");
      commentList.allComments.push(resp.data.comment);
      updateCommentList(commentList);
      return false;
    }

    return false;

    /*
    // ニコニコデータセット (NII) から取得したコメントデータを挿入する処理 (描画負荷が高すぎたので削除)
    let archivedComments = await getArchivedComments(vidId);
    if (archivedComments) {
      for(const row of archivedComments) {
        if (!row)
          continue;

        comments.push({
          id:	"",
          postedAt: row.date,
          message: row.content,
          command: row.command,
          vposMsec: row.vpos });
      }
    }


    return createJsonResponse({
      meta: resp.meta,
      data: {
        comments: comments
      }
    });
    */
  }

  /*
  // ニコニコデータセット (NII) のコメントデータを取得する
  async function getArchivedComments(vidId) {
    let resp = await fetch("http://localhost:8080/" + vidId + ".jsonl");
    // jsonl なので行分割
    let jsonItems = (await resp.text()).split("\n");
    return jsonItems.map(x => {
      try {
        return JSON.parse(x);
      }
      catch (_) {
        return null;
      }
    });
  }
  */

  function createJsonResponse(obj) {
    return {
      json: () => {
        return new Promise(resolve => resolve(obj));
      }
    };
  }

  // コメントリストを挿入する & レイアウトを整える
  function appendCommentList() {
    /*

    +-----------------------------------------+
    | elmPage (main > div:first-child)        |
    | +-------------------------------------+ |
    | | elmColContainer                     | |
    | | +------------+  +-----------------+ | |
    | | | elmColLeft |  | elmColRight     | | |
    | | | +--------+ |  | +-------------+ | | |
    | | | | video  | |  | | commentList | | | |
    | | | | input  | |  | |             | | | |
    | | | +--------+ |  | +-------------+ | | |
    | | +------------+  +-----------------+ | |
    | +-------------------------------------+ |
    +-----------------------------------------+

    */
    const elmPage = document.querySelector("main > div:first-child");
    if (!elmPage) {
      // まだ読み込みが終わっていなかったら 250ms 待つ
      setTimeout(appendCommentList, 250);
      return;
    }
    const elmPlayer = elmPage.children[0];
    const elmCommentInput = elmPage.children[1];

    const elmVideo = elmPlayer.querySelector("video");
    if (!elmVideo) {
      setTimeout(appendCommentList, 250);
      return;
    }
    elmPage.setAttribute("style", elmPage.getAttribute("style") + ";--max-player-width: 1200px; width: auto; max-width: unset;");

    const elmColContainer = document.createElement("div");
    elmColContainer.setAttribute("style", "display: grid; grid-template-columns: 2fr 1fr; gap: 12px;");

    const elmColLeft = document.createElement("div");
    elmColLeft.setAttribute("style", "display: flex;flex-direction: column;gap: 12px;");
    elmColContainer.appendChild(elmColLeft);
    const elmColRight = document.createElement("div");
    elmColRight.setAttribute("style", "position: relative;");
    elmColContainer.appendChild(elmColRight);

    elmPlayer.setAttribute("style", "margin-left: 0; margin-right: 0; border-radius: 12px; width: 100%");

    // コメント投稿時に挿入される Cloudflare Turnstile 用 iframe は
    // elmPlayer の要素位置を基準にしているようなので、元の要素は残しておく
    const elmPlayerCloned = elmPlayer.cloneNode(false);

    const inputContainer = elmCommentInput.children[0];
    inputContainer.setAttribute("style", "display: grid; grid-template-columns: 1fr 3fr 1fr; grid-auto-rows: 40px;");

    const controlContainer = elmPlayer.children[2];
    controlContainer.setAttribute("style", "gap: 10px;");

    elmPage.insertBefore(elmColContainer, elmPlayer);

    elmColLeft.appendChild(elmPlayerCloned);
    while(elmPlayer.firstElementChild)
      elmPlayerCloned.appendChild(elmPlayer.removeChild(elmPlayer.firstElementChild));

    elmCommentInput.parentElement.removeChild(elmCommentInput);
    elmColLeft.appendChild(elmCommentInput);

    const ngCommentUl = document.querySelector("#popover\\:\\:r0\\:\\:content > div > ul");
    const ulObserver = new MutationObserver((mutations, _observer) => {
      mutations.forEach(mutation => {
        if (mutation.type == "childList") {
          // NG設定のリストが増減する場合に呼び出される
          // timeoutはlocalStorageの更新待ち
          updateCommentListOnTimeout(commentList, 250);
        }
      });
    });
    ulObserver.observe(ngCommentUl, { childList: true });

    // スタイルシート挿入
    let elmStyle = document.createElement("style");
    console.log(elmStyle);
    elmStyle.textContent = STYLE_SHEET;
    document.head.appendChild(elmStyle);
    
    commentList.install(elmColRight);
    commentList.startTimeSync(elmVideo);
  }

  function mescToTime(v) {
    return padLeft(Math.floor(v / (1000 * 60)), 2, "0") + ":" + padLeft(Math.floor(v / 1000) % 60, 2, "0");
  }

  function padLeft(str, num, padding) {
    return (padding.repeat(num) + str).slice(-num);
  }

  /** @type {(className: string) => HTMLDivElement} */
  function createDivElement(className) {
    let elm = document.createElement("div");
    elm.setAttribute("class", className);
    return elm;
  }

  function createSvgElement(svg) {
    let elm = document.createElement("div");
    elm.innerHTML = svg;
    return elm.firstElementChild;
  }

  fetch = new Proxy(fetch, {
    apply: async function(target, thisArg, args) {
      let response = await target.apply(thisArg, args);
      return await onFetchApi(typeof args[0] === "string" ? args[0] : args[0].url, response);
    }
  });

  appendCommentList();
})();
