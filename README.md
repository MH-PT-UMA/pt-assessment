# PT評価記録

理学療法士による評価記録用のWebアプリ。サーバー不要の静的サイトで、記録は端末のブラウザ内（IndexedDB）にだけ保存される。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` / `style.css` / `app.js` | アプリ本体 |
| `domains/posture.js` | 評価領域①「姿勢・フィジカル」の項目定義と、クライアント向け説明文 |
| `domains/exercises.js` | おすすめ運動の一覧（運動名・やり方・目安） |
| `manifest.json` / `sw.js` / `icons/` | ホーム画面への追加とオフライン動作 |

## 文面・項目を変えたいとき

- クライアント向けの説明文：`domains/posture.js` の `client:` の文章を書き換える。
- 運動の内容：`domains/exercises.js` を書き換える。
- 項目の追加：`domains/posture.js` の `items` に1行足す（書き方はファイル冒頭のコメント）。
- 一度使った `id` は変えない（過去の記録と結びつかなくなる）。

## 評価領域を追加するとき（②運動器 など）

1. `domains/posture.js` をコピーして `domains/ortho.js` などを作り、`id`・`label`・`sections` を書き換える。
2. `index.html` に `<script src="domains/ortho.js"></script>` を足す。
3. `sw.js` の `ASSETS` に `'domains/ortho.js'` を足し、`CACHE` の番号を上げる。

入力画面に領域の切り替えタブが出て、比較・出力・CSVにも自動で反映される。

## GitHub Pages で公開する

1. GitHubで新しいリポジトリを作り、このフォルダの中身をアップロードする。
2. リポジトリの Settings → Pages → Branch で `main` / `(root)` を選んで保存する。
3. 表示されたURLをスマホで開き、「ホーム画面に追加」する。

ファイルを更新したら `sw.js` の `CACHE` の番号を上げる（上げない場合も、アプリを2回開き直すと新しくなる）。

## パソコンで試す

```bash
python -m http.server 8123
```

このフォルダで実行し、ブラウザで `http://localhost:8123/` を開く。
