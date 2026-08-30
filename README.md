# ホケット

『ホケット』は、固定された発射装置から弾を撃ち、パックへ当てて相手ゴールを狙う縦画面のブラウザゲームです。

現在はP4先行のシステム中断・遅延監視・試合目的の案内まで進んだ段階です。起動時のホーム、照準・指を離す・充電輪を待つ操作を実際に試せる3手順の基本説明、完了状態の復元、試合選択、30秒の試し撃ち、説明を飛ばして遊ぶ導線、効果音・音楽を個別に切り替える設定、同じブラウザでの設定復元、試合結果の最大20件保存とコピー、保存不可・破損時の無音・記録復旧、縦画面のCanvas描画、固定更新の物理、Pointer／キーボード入力、矢印照準、Enter／Space発射、Escapeと画面ボタンの停止・3秒再開、画面非表示・bfcache・横向き・表示領域変更・WebGL復元時のシステム中断、弾・パック・障害物・反射板・予約リング・2点コア・ゴール拡大・中央波・得点・90秒時計、同じ物理規則で動くれんしゅう／ふつうCPUの自動射撃、両砲台の発射状態表示、HTMLの結果画面、同条件再戦を実装しています。ストレート・ベンチ、ツイン・ブロック、リフレクト・レーンを開始できます。音声や保存領域が利用できない場合もゲームを継続できます。

## 公開

公開先URLは [https://chameleonjp-lab.github.io/hoketto/](https://chameleonjp-lab.github.io/hoketto/) です。GitHub Pagesは、`main`へのマージ後にGitHub Actionsの「Deploy GitHub Pages」がビルドした`dist`を公開します。初回だけ、リポジトリのSettings → Pages → Build and deployment → Sourceで「GitHub Actions」を選びます。

## 計画書

- [リッチなブラウザゲーム実装計画書](docs/IMPLEMENTATION_PLAN.md)
- [ゲーム規則](docs/GAME_RULES.md)
- [画面と操作の流れ](docs/UX_FLOW.md)
- [ビジュアル方針](docs/ART_DIRECTION.md)
- [検査記録](docs/TEST_REPORT.md)
