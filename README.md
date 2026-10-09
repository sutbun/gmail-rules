# Gmail Rules

Gmail標準フィルタをiPhone・PCから作成／編集／削除する、個人用のサーバー不要Webアプリです。

**開発版：DEV-10.09-2** — Gmail実アカウントでのOAuth・iPhone通知テストは未実施。

## できること

- 複数送信元、件名、メール全体（件名＋本文）の検索語句と除外語句を組み合わせる
- Gmail側で受信トレイをスキップ（アーカイブ）／ゴミ箱へ移動／ラベルを付ける／既読にする
- Gmail標準の既存フィルタを一覧・削除する
- 本アプリ形式のフィルタを編集する（先に新しいフィルタを作り、旧フィルタを削除）
- Gmailにラベルを作成する
- Gmail APIへブラウザから直接アクセス（独自サーバーにメール・認証情報は送らない）

**留意点**：

- メールへの通知を直接OFFにするAPIではありません。Gmailで「受信トレイをスキップ」したうえで、iPhoneのGmailアプリ通知設定を「メインのみ」にする運用を前提とします。実機確認が必要です。
- Gmailフィルタは将来届くメールに適用されます。既存メールの一括処理は未実装です。
- 「メール全体」検索は件名＋本文などを検索します。本文だけの厳密な条件ではありません。
- 件名・送信元・全文の**異なる条件グループはAND**、同じグループ内の複数値はORです。除外条件はどれかに一致すると除外します。
- OAuthのアクセストークンはメモリ内だけに保持し、ブラウザへの永続保存はしません。OAuthクライアントIDのみlocalStorageに保存します。期限切れ時は「Googleに再接続」で再認証します。
- 対応していない既存Gmailフィルタは削除だけ可能、編集はGmail本体で行います。

## GitHubで公開する（初回セットアップ）

1. https://github.com/new から **gmail-rules** というPublicリポジトリを作成します。「Add a README file」をオンにして作成してください（あとで同梱READMEに置き換えます）。その他のファイルは不要です。
2. このZIPの中身をリポジトリ直下にコミットします（ChatGPTのGitHub連携に書込権限があれば、リポジトリ作成後のアップロード作業はChatGPTに依頼できます）。クライアントシークレット／APIキー／アクセストークンは絶対に追加しないでください。
3. GitHubのリポジトリ画面で **Settings → Pages → Build and deployment → Source: Deploy from a branch → main / (root) → Save** を選びます。
4. 公開先は通常 `https://sutbun.github.io/gmail-rules/` になります。Pages の表示で実際の URL を確認してください。
5. 下の手順に沿って Google Cloud 側に公開URLのオリジンを登録します。

**注意**：リポジトリはPublicであっても、メールの内容や認証トークンはGitHubに公開されません。このアプリのソースだけが公開されます。外部の人にアプリを使わせる予定はなく、OAuthの利用者は自分のGoogleアカウントに限定します。

## Google Cloud側の準備（利用者本人による最初の一回）

1. https://console.cloud.google.com/ で自分用のプロジェクトを作成します。
2. 「APIとサービス」で **Gmail API** を有効にします。
3. 「Google Auth Platform」のブランド・対象ユーザー／テストユーザーを設定します。個人用のGmailなら通常は外部ユーザーで、テストユーザーに自分のGoogleアカウントを追加します。
4. OAuth クライアントを **ウェブアプリケーション** として作成し、「承認済みのJavaScript生成元」に公開URLのオリジン（例：`https://YOUR_USERNAME.github.io`）を登録します。`/gmail-rules` などのパスは含めません。ローカル開発時のみ使用する場合はローカルの生成元を別途登録します。
5. OAuth同意画面で以下のスコープを使います。
   - `https://www.googleapis.com/auth/gmail.settings.basic`（フィルタ管理）
   - `https://www.googleapis.com/auth/gmail.labels`（ラベル管理）
6. 公開URLでGmail Rulesを開き、OAuthクライアントID（`...apps.googleusercontent.com`）を入力し、「Googleアカウントに接続」を押します。
7. iPhoneのGmailアプリで **設定 → 対象アカウントのメール通知** を開き、通知対象を「メインのみ」に設定します。Gmail以外のメールアプリも利用している場合は、そちらの通知設定を別途確認してください。
8. まず自分宛てのテストメールの送信元だけを条件としてアーカイブするルールを登録し、実際に受信トレイへの表示と通知が抑えられるか確認します。

> 注意：`gmail.settings.basic` はGoogleが「制限付き（Restricted）」として扱う権限です。個人で動作確認する段階と、不特定多数に公開する段階では必要な確認・審査が異なります。**第三者へ公開する前にGoogleの最新ポリシーを必ず確認してください。** クライアントシークレットやアクセストークンをリポジトリにコミットしないでください。

## 配布・起動

外部JSライブラリのビルドは不要。リポジトリ内ファイルを静的HTTPSホスティング（GitHub Pages等）でそのまま公開します。`index.html` を含むこのディレクトリを公開ディレクトリにしてください。

### iPhone

1. GitHub PagesのURLを **Safari** で開きます。
2. Safariの共有メニュー → 「ホーム画面に追加」を選びます。
3. アイコンからGmail Rulesを開きます。
4. iPhoneのホーム画面追加モードではGoogle認証のポップアップに制約が出る可能性があるので、その場合はSafari本体で接続してください。

### ローカル検証

`npm test` は外部依存なく実行できます。ブラウザの実行にはHTTPSかlocalhostのHTTPサーバーが必要です。開発サーバーのポートは `sutbun/ai-dev/DEV-PORTS.md` に登録してから使用してください。`file://` に直接HTMLを開く動作はサポートしません。

## 安全性・プライバシー

- JavaScriptからGmail公式APIを直接呼び出します。
- Gmail本文を取得するスコープは要求しません。
- アプリ本体は静的サイトですが、Google認証UIとGmail API通信にはインターネットが必要です。
- 自動削除は確認ダイアログ付きです。
- 編集時は先に新ルールを作成します。旧ルールを削除できなかった場合は両方残ることを明示します。
- Github Pages等に公開する場合、**HTML/JavaScriptを公開することとOAuth認証のアクセス範囲は別**です。Google OAuthの許可されたアカウント・originを適切に管理してください。

## 将来の機能

1. 過去メールを事前にプレビューして一括処理（追加の `gmail.readonly`/`gmail.modify` 権限が必要）
2. 本文のみの厳密な条件や高度な判定（Gmail標準フィルタではできず、独立した処理が必要）
3. iPhone上でGoogle認証・Gmailの通知抑止を実機検証し、必要に応じて認証導線を改善

## 根拠資料

- https://developers.google.com/workspace/gmail/api/guides/filter_settings
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://support.google.com/mail/answer/1075549?co=GENIE.Platform%3DiOS&hl=ja