# 勤務時間集計 - Comiru CSV連携 Chrome拡張

勤務時間集計アプリから指定された校舎と1か月でComiruの指導報告書検索を開き、次の操作を自動化するManifest V3拡張です。アプリから受け取った校舎識別子をそのまま使い、開いているタブから校舎を推測したり藍住校へフォールバックしたりしません。

1. Comiruの指導報告書検索を指定期間で開く（既存のComiruタブがあれば再利用）
2. `.read-more`（「さらに表示」）が表示されなくなるまで押す
3. 表示された指導報告書をすべて選択する
4. `name="csv"` のボタンがあるフォームを、現在のログイン情報を使ってPOSTする
5. 取得したCSVを一時保存し、勤務時間集計アプリへ戻して渡す

## インストール

1. Chromeで `chrome://extensions/` を開きます。
2. 右上の「デベロッパー モード」をオンにします。
3. アプリから取得したZIPを展開します。
4. 「パッケージ化されていない拡張機能を読み込む」を押し、展開したフォルダを選びます。
5. Comiruへ通常どおりログインした状態で、`https://work-summary-tool.vercel.app/` を開きます。

拡張を更新した場合は、`chrome://extensions/` にある本拡張の更新ボタンを押し、アプリのタブを再読み込みしてください。

## アプリとのメッセージ仕様

通信プロトコルはバージョン2です。ページから拡張へは、次のメッセージを送ります。日付は `YYYY-MM-DD` 形式です。`campusId` と `tenant` は必須です。

```js
const requestId = crypto.randomUUID();

window.postMessage({
  source: 'work-summary-tool',
  version: 2,
  type: 'COMIRU_IMPORT_REQUEST',
  requestId,
  campusId: 'aizumi',
  tenant: 'bestone-aizumi',
  startDate: '2026-06-01',
  endDate: '2026-06-30',
}, window.location.origin);
```

拡張の導入確認には次を送ります。

```js
window.postMessage({
  source: 'work-summary-tool',
  version: 2,
  type: 'COMIRU_EXTENSION_PING',
}, window.location.origin);
```

ページは `source: 'work-summary-comiru-extension'`、`version: 2` のメッセージを受け取ります。処理に関するメッセージには、要求時と同じ `campusId` と `tenant` が含まれます。

- `campusId` は `aizumi` または `kitajima_chuo`
- `tenant` は英小文字・数字・ハイフンのみの1〜80文字
- `campusId: 'aizumi'` の場合、`tenant` は必ず `bestone-aizumi`

- `COMIRU_EXTENSION_READY`: 拡張が利用可能
- `COMIRU_IMPORT_STATUS`: `requestId`、`campusId`、`tenant`、`stage`、日本語の `message`、件数等の `details`
- `COMIRU_CSV_READY`: `requestId`、`campusId`、`tenant`、`fileName`、`mimeType`、元CSVバイト列の `base64`、`rowCount`、期間
- `COMIRU_IMPORT_ERROR`: `requestId`、`campusId`、`tenant`、`code`、日本語の `message`、必要に応じて `detail`

完了データを既存のファイル読込処理へ渡す例です。

```js
window.addEventListener('message', (event) => {
  if (
    event.source !== window
    || event.origin !== window.location.origin
    || event.data?.source !== 'work-summary-comiru-extension'
    || event.data?.version !== 2
    || event.data?.type !== 'COMIRU_CSV_READY'
  ) {
    return;
  }

  const { base64, fileName, mimeType, campusId, tenant } = event.data;
  if (campusId !== 'aizumi' || tenant !== 'bestone-aizumi') {
    return;
  }
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const file = new File([bytes], fileName || '指導報告書.csv', {
    type: mimeType || 'text/csv',
  });
  // ここで既存のCSV保存・読込処理へfileを渡します。
  // 保存・読込の受付に成功した後で、拡張へ受領確認を返します。
  window.postMessage({
    source: 'work-summary-tool',
    version: 2,
    type: 'COMIRU_CSV_ACK',
    requestId: event.data.requestId,
    campusId,
    tenant,
    ok: true,
  }, window.location.origin);
});
```

`COMIRU_CSV_ACK` が届くまで、拡張はCSVを一時保存したままにします。受領確認にはCSVと同じ `campusId` と `tenant` が必要です。10秒以内に届かない場合、校舎情報が一致しない場合、または画面が閉じられた場合は成功扱いにせず、再送後も確認できなければエラーを通知します。

## 進捗フェーズ

主な `stage` は次のとおりです。

- `accepted`
- `opening_comiru`
- `page_ready`
- `waiting_for_results`
- `loading_reports`
- `selecting_reports`
- `downloading_csv`
- `csv_ready`
- `returning_to_app`
- `complete`

## 権限とデータの扱い

- 対象サイトは `comiru.jp` と `work-summary-tool.vercel.app` の2つだけです。
- 取得要求は、勤務時間集計アプリを表示中に操作した同じ月の31日以内に限定します。
- Cookieを直接読む権限、ダウンロード権限、全サイトへのアクセス権限はありません。
- CSVは外部サーバーへ送信しません。Chromeの `storage.session` に一時保存し、アプリが受領した直後に削除します。
- 正常受領後または処理失敗時に一時データを削除します。予期しない中断で残った場合も、次回実行時に30分を超えたデータを削除します。

## 利用上の注意

- Comiruのログインや多要素認証は自動で回避しません。ログイン期限が切れている場合は、開いたComiruタブでログインしてから再実行してください。
- 同時に実行できるCSV取得は1件です。
- 全件読込とCSV取得には150秒の上限があります。上限を超えた場合は、期間を短くして再実行してください。
- Comiru側の画面構造やCSVフォームが変更された場合は、セレクタの調整が必要になることがあります。
- 対象校舎の `tenant` が未設定・不正な場合は処理を開始しません。既存のComiruタブから推測したり、`bestone-aizumi` を代用したりすることはありません。
- 指定した `tenant` の `/reports/search` へ移動できない場合や、CSVフォームの送信先が別の `tenant` だった場合は安全のため停止します。

## localhostでE2E確認する場合

配布用 `manifest.json` は、本番アプリ以外へのアクセスを許可していません。ローカル確認時だけ、作業用コピーの次の2か所へ `http://localhost:5173/*` を追加してください。

1. `host_permissions`
2. アプリ側 `content_scripts[0].matches`

本番用ファイルにはlocalhost権限を残さず、Vercel上で最終確認する運用を推奨します。
