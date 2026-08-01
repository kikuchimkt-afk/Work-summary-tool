# 勤務時間集計ツール Re:Act

Comiruの指導報告書CSVから、講師別の勤務時間を集計するWebアプリです。

## 主な機能

- Comiru指導報告書CSVの読み込み（UTF-8／Shift-JIS自動判定）
- 授業時刻の推定、欠席表示、個別・集団・英会話・事務時間の分類
- 講師別シートを含むExcel出力（A4縦・横幅1ページ）
- 修正済みExcelから講師別PDFを作成し、ZIPで一括保存
- 専用Chrome拡張によるComiru CSVの自動取得

## Comiruから自動取得

本番アプリの「Comiruから自動取得」で対象月を選ぶと、専用Chrome拡張が次の処理を行います。

1. 指定期間の指導報告書検索を開く
2. 「さらに表示」が消えるまで全件を読み込む
3. 指導報告書をすべて選択する
4. CSVを取得してダウンロードフォルダへ保存する
5. CSVを勤務時間集計アプリへ渡し、そのまま集計を開始する

初回設定とデータの扱いは [extension/README.md](extension/README.md) を参照してください。

## 開発

```bash
npm install
npm run dev
```

本番ビルドの確認:

```bash
npm run build
```

Chrome拡張の配布ZIPは、`extension`フォルダの内容をまとめて `public/work-summary-comiru-extension.zip` として配置します。
