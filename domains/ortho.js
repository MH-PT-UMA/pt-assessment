/*
 * 評価領域 ②「運動器」の定義（整形外科テスト）
 *
 * テストを足すときは、該当する部位の一覧に t('id', 'テスト名', ['音声入力での別の言い方']) を1行足す。
 * どのテストも左右別に「陰性／陽性」を記録する。一度使った id は変えない。
 * クライアント向けの文章では、テスト名や疾患名は出さず、部位ごとにまとめて伝える。
 */
(function () {
  'use strict';
  var PTA = window.PTA = window.PTA || { domains: [], exercises: {} };

  function t(id, label, say) {
    return {
      id: id, label: label, type: 'choice', bilateral: true, finding: true, say: say || [],
      options: [
        { v: 'neg', label: '陰性', score: 1, say: ['ネガティブ'] },
        { v: 'pos', label: '陽性', score: 0, say: ['ポジティブ'] }
      ]
    };
  }

  // 部位ごとのセクション。plain はクライアント向け文章での部位の呼び方
  function region(id, label, plain, items) {
    var sides = function (v, want) { return ['R', 'L'].filter(function (k) { return v[k] === want; }); };
    return {
      id: id, label: label, optional: true, items: items,
      // 記録文：陽性：ニアーテスト(R)、…／陰性：ドロップアームテスト、…
      record: function (get) {
        var pos = [], neg = [];
        items.forEach(function (i) {
          var v = get(i.id);
          if (!v) return;
          var p = sides(v, 'pos'), n = sides(v, 'neg');
          if (p.length) pos.push(i.label + '(' + (p.length === 2 ? '両側' : p[0]) + ')');
          if (n.length) neg.push(i.label + (n.length === 2 ? '' : '(' + n[0] + ')'));
        });
        return [pos.length ? '陽性：' + pos.join('、') : '', neg.length ? '陰性：' + neg.join('、') : '']
          .filter(Boolean).join('／');
      },
      client: function (get) {
        var tested = false, hit = { R: false, L: false };
        items.forEach(function (i) {
          var v = get(i.id);
          if (!v) return;
          tested = true;
          sides(v, 'pos').forEach(function (k) { hit[k] = true; });
        });
        if (!tested) return null;
        if (!hit.R && !hit.L) return { text: plain + 'のチェックでは、気になるサインはありませんでした。', ex: [] };
        var pre = hit.R && hit.L ? '左右の' : hit.R ? '右の' : '左の';
        return { text: pre + plain + 'のチェックで、負担がかかりやすいサインがみられました。痛みの出ない範囲で動かしていきましょう。', ex: [] };
      }
    };
  }

  PTA.domains.push({
    id: 'ortho',
    label: '運動器',
    sections: [
      region('neck', '整形外科テスト：頸部・胸郭出口', '首まわり', [
        t('spurling', 'スパーリングテスト', ['スパーリング']),
        t('jackson', 'ジャクソンテスト', ['ジャクソン']),
        t('sh_depress', '肩引き下げテスト', ['肩引き下げ']),
        t('adson', 'アドソンテスト', ['アドソン']),
        t('wright', 'ライトテスト'),
        t('morley', 'モーリーテスト', ['モーリー']),
        t('eden', 'エデンテスト'),
        t('roos', 'ルーステスト')
      ]),
      region('shoulder', '整形外科テスト：肩', '肩', [
        t('neer', 'ニアーテスト', ['ニアー', 'ニアテスト']),
        t('hawkins', 'ホーキンス・ケネディテスト', ['ホーキンスケネディテスト', 'ホーキンステスト', 'ホーキンス']),
        t('painful_arc', 'ペインフルアークサイン', ['ペインフルアーク', '有痛弧']),
        t('empty_can', 'エンプティカンテスト', ['エンプティカン', '棘上筋テスト']),
        t('drop_arm', 'ドロップアームテスト', ['ドロップアーム']),
        t('lift_off', 'リフトオフテスト', ['リフトオフ']),
        t('belly_press', 'ベリープレステスト', ['ベリープレス']),
        t('speed', 'スピードテスト'),
        t('yergason', 'ヤーガソンテスト', ['ヤーガソン']),
        t('obrien', 'オブライエンテスト', ['オブライエン']),
        t('apprehension', 'アプリヘンションテスト', ['アプリヘンション', '前方不安感テスト']),
        t('sulcus', 'サルカスサイン', ['サルカス'])
      ]),
      region('elbow_hand', '整形外科テスト：肘・手', 'ひじ・手首', [
        t('thomsen', 'トムゼンテスト', ['トムゼン', 'トムセンテスト']),
        t('chair', 'チェアテスト'),
        t('middle_finger', '中指伸展テスト', ['中指伸展']),
        t('golf', '内側上顆炎テスト', ['ゴルフ肘テスト']),
        t('elbow_valgus', '肘外反ストレステスト', ['肘外反ストレス']),
        t('phalen', 'ファレンテスト', ['ファレン', 'ファーレンテスト']),
        t('tinel_wrist', 'ティネル徴候', ['ティネル', 'チネル徴候', 'チネル']),
        t('finkelstein', 'フィンケルシュタインテスト', ['フィンケルシュタイン'])
      ]),
      region('lumbar', '整形外科テスト：腰部・骨盤', '腰・骨盤まわり', [
        t('slr_test', 'SLRテスト', ['ラセーグテスト', 'ラセーグ徴候', 'ラセーグ']),
        t('bragard', 'ブラガードテスト', ['ブラガード']),
        t('fnst', 'FNSテスト', ['fns', '大腿神経伸展テスト']),
        t('kemp', 'ケンプテスト', ['ケンプ']),
        t('gaenslen', 'ゲンスレンテスト', ['ゲンスレン']),
        t('newton', 'ニュートンテスト'),
        t('si_compress', '仙腸関節圧迫テスト', ['仙腸関節圧迫'])
      ]),
      region('hip', '整形外科テスト：股関節', '股関節', [
        t('patrick', 'パトリックテスト', ['パトリック', 'フェイバーテスト', 'faberテスト']),
        t('fadir', 'FADIRテスト', ['fadir', 'ファダーテスト', '前方インピンジメントテスト']),
        t('trendelenburg', 'トレンデレンブルグ徴候', ['トレンデレンブルグ', 'トレンデレンブルク徴候', 'トレンデレンブルク']),
        t('ober', 'オーバーテスト'),
        t('ely', 'エリーテスト')
      ]),
      region('knee', '整形外科テスト：膝', '膝', [
        t('lachman', 'ラックマンテスト', ['ラックマン', 'ラクマンテスト']),
        t('ant_drawer', '前方引き出しテスト', ['前方引き出し']),
        t('post_drawer', '後方引き出しテスト', ['後方引き出し']),
        t('sagging', 'サギング徴候', ['サギング']),
        t('pivot_shift', 'ピボットシフトテスト', ['ピボットシフト']),
        t('valgus', '外反ストレステスト', ['外反ストレス']),
        t('varus', '内反ストレステスト', ['内反ストレス']),
        t('mcmurray', 'マクマレーテスト', ['マクマレー', 'マックマレーテスト', 'マクマリーテスト']),
        t('apley', 'アプレー圧迫テスト', ['アプレーテスト', 'アプレー', 'アプレイテスト']),
        t('ballottement', '膝蓋跳動', ['膝蓋跳動テスト']),
        t('clarke', 'クラークテスト', ['クラーク', 'パテラグラインディングテスト']),
        t('patella_app', '膝蓋骨アプリヘンションテスト', ['膝蓋骨アプリヘンション', '膝蓋骨不安感テスト']),
        t('grasping', 'グラスピングテスト', ['グラスピング'])
      ]),
      region('ankle', '整形外科テスト：足関節・足部', '足首・足', [
        t('ankle_drawer', '足関節前方引き出しテスト', ['足関節前方引き出し']),
        t('talar_tilt', '距骨傾斜テスト', ['距骨傾斜', '足関節内反ストレステスト']),
        t('thompson', 'トンプソンテスト', ['トンプソン']),
        t('squeeze', 'スクイーズテスト'),
        t('windlass', 'ウィンドラステスト', ['ウィンドラス']),
        t('tinel_tarsal', '足根管ティネル徴候', ['足根管ティネル'])
      ])
    ]
  });

  PTA.voiceFixes = (PTA.voiceFixes || []).concat([
    ['エスエルアールテスト', 'slrテスト'], ['エフエヌエス', 'fns'], ['ファダー', 'fadir'], ['フェイバー', 'faber']
  ]);
})();
