// ==UserScript==
// @name     コメントパネル for Re:仮
// @namespace  https://github.com/inonote/nico-rekari-comment-panel-userscript
// @version    2024-06-15
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

(function() {
  "use strict";

  function CommentList() {
    this.elmList = document.createElement("div");
    this.elmList.setAttribute("style", "border: 2px solid #dadada;width: 100%;overflow: scroll;position: absolute;height: 100%;font-size:80%");
    this.comments = [];
  }
  CommentList.prototype = {
    // コメントリスト挿入
    install: function(parentElement) {
      parentElement.appendChild(this.elmList);
    },

    // コメントリスト描画 (非効率)
    draw: function() {
      this.comments.sort((a, b) => a.vposMsec - b.vposMsec);
      const createItemCol = function(text, width) {
        let elmCol = document.createElement("div");
        elmCol.setAttribute("style", "min-width: " + width + ";text-overflow: ellipsis;overflow: hidden;white-space: nowrap;padding: 4px 8px;border-right: 1px solid #dadada;");
        elmCol.innerText = text;
        return elmCol;
      }

      // ヘッダー
      {
        let elmListItem = document.createElement("div");
        elmListItem.setAttribute("style", "display: flex;position: sticky;top: 0;");
        elmListItem.appendChild(createItemCol("コメント", "calc(100% - 80px);background: #f2f2f2"));
        elmListItem.appendChild(createItemCol("再生時間", "80px;background: #f2f2f2"));
        elmListItem.appendChild(createItemCol("書込日時", "180px;background: #f2f2f2"));
        this.elmList.appendChild(elmListItem);
      }

      for(let idx = 0; idx < this.comments.length; ++idx) {
        let elmListItem = document.createElement("div");
        elmListItem.setAttribute("style", "display: flex;");
        elmListItem.appendChild(createItemCol(this.comments[idx].message, "calc(100% - 80px)"));
        elmListItem.appendChild(createItemCol(mescToTime(this.comments[idx].vposMsec), "80px"));
        elmListItem.appendChild(createItemCol(new Date(this.comments[idx].postedAt).toLocaleString(), "180px"));
        this.elmList.appendChild(elmListItem);
        this.comments[idx].elmItem = elmListItem;
      }
    },

    // 再生時間とコメントリストの位置を同期させる
    syncCurrentTime: function(time) {
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
      setInterval(() => {
        if (!elmVideo.paused)
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

  async function onGetComments(vidId, resp) {
    console.log("コメント取得: " + vidId);

    let comments = resp.data.comments;
    console.log("コメント件数", resp.data.comments.length);

    commentList.comments = comments;
    commentList.draw();

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
    | elmPage (main > div:first-child)    |
    | +-------------------------------------+ |
    | | elmColContainer           | |
    | | +------------+  +-----------------+ | |
    | | | elmColLeft |  | elmColRight   | | |
    | | | +--------+ |  | +-------------+ | | |
    | | | | video  | |  | | commentList | | | |
    | | | | input  | |  | |       | | | |
    | | | +--------+ |  | +-------------+ | | |
    | | +------------+  +-----------------+ | |
    | +-------------------------------------+ |
    +-----------------------------------------+

    */
    const elmPage = document.querySelector("main > div:first-child");
    if (!elmPage) {
      // まだ読み込みが終わっていなかったら 250ms 待つ
      setTimeout(appendCommentList, 250);
      return
    }
    const elmPlayer = elmPage.children[0];
    const elmCommentInput = elmPage.children[1];

    const elmVideo = elmPlayer.querySelector("video");
    if (!elmVideo) {
      setTimeout(appendCommentList, 250);
      return
    }
    elmPage.setAttribute("style", elmPage.getAttribute("style") + ";--max-player-width: 1200px;");

    const elmColContainer = document.createElement("div");
    elmColContainer.setAttribute("style", "display: flex;gap: 12px");

    const elmColLeft = document.createElement("div");
    elmColLeft.setAttribute("style", "display: flex;flex-direction: column;gap: 12px;width: calc(100% - 400px);");
    elmColContainer.appendChild(elmColLeft);
    const elmColRight = document.createElement("div");
    elmColRight.setAttribute("style", "flex: 1 1 auto; position: relative;");
    elmColContainer.appendChild(elmColRight);

    elmPage.insertBefore(elmColContainer, elmPlayer);
    elmPlayer.parentElement.removeChild(elmPlayer);
    elmColLeft.appendChild(elmPlayer);
    elmCommentInput.parentElement.removeChild(elmCommentInput);
    elmColLeft.appendChild(elmCommentInput);

    commentList.install(elmColRight);
    commentList.startTimeSync(elmVideo);
  }

  function mescToTime(v) {
    return padLeft(Math.floor(v / (1000 * 60)), 2, "0") + ":" + padLeft(Math.floor(v / 1000) % 60, 2, "0");
  }

  function padLeft(str, num, padding) {
    return (padding.repeat(num) + str).slice(-num);
  }

  const fetchHandler = {
    apply: async function(target, thisArg, args) {
      let response = await target.apply(thisArg, args);
      return await onFetchApi(typeof args[0] === "string" ? args[0] : args[0].url, response);
    }
  };
  fetch = new Proxy(fetch, fetchHandler);

  appendCommentList();
})();
