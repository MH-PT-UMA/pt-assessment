/*
 * 評価領域 ①「姿勢・フィジカル」の定義
 *
 * 領域を追加するときは、このファイルをコピーして PTA.domains.push({...}) の中身を
 * 書き換え、index.html と sw.js に1行足す。入力画面・比較・出力・CSV に自動で反映される。
 *
 * 項目（items）の書き方
 *   id        … 保存用の名前（英数字。一度使ったら変えない）
 *   label     … 入力画面と記録文に出る名前
 *   type      … check（タップでON/OFF）/ choice（1つ選ぶ）/ multi（複数選ぶ）
 *               / number（数値）/ scale（0〜5 など段階をタップ）
 *   bilateral … true で左右別に入力
 *   better    … 'high'（大きいほど良い）/ 'low'（小さいほど良い）。比較の「改善／低下」に使う
 *   finding   … true のとき「所見あり＝偏位」。前回あり→今回なしを「消失」と判定する
 *   plain     … クライアント向け文章で使う、専門用語を避けた項目名
 *   client    … クライアント向けの説明文（文字列、または値を受け取る関数）
 *   ex        … おすすめ運動の id（exercises.js）
 *   options   … choice / multi の選択肢。score を付けると大きいほど良いとして比較する
 */
(function () {
  'use strict';
  var PTA = window.PTA = window.PTA || { domains: [], exercises: {} };

  var SIDE = { R: '右', L: '左' };
  var PRE = { R: '右の', L: '左の', B: '左右とも' };
  var PRE_DIR = { R: '右に', L: '左に', B: '左右とも' };

  // 左右別の値 v = {R, L} のうち pred に当てはまる側について文章を作る
  function sided(pred, text, o) {
    o = o || {};
    var pre = o.pre || PRE;
    return function (v) {
      var hit = ['R', 'L'].filter(function (k) { return v[k] != null && pred(v[k]); });
      if (hit.length) return { text: text(hit.length === 2 ? pre.B : pre[hit[0]]), ex: o.ex };
      if (o.diff && typeof v.R === 'number' && typeof v.L === 'number' && Math.abs(v.R - v.L) >= o.diff) {
        var worse = (o.better === 'low' ? v.R > v.L : v.R < v.L) ? 'R' : 'L';
        return { text: o.diffText(SIDE[worse]), ex: o.ex };
      }
      return null;
    };
  }

  // ROM 項目。ref は参考可動域、ref の8割未満（または o.limit 未満）で「かたい傾向」と説明する
  function rom(group, name, id, plain, ref, ex, o) {
    o = o || {};
    var limit = o.limit != null ? o.limit : ref * 0.8;
    var text = function (s) { return s + plain + 'がややかたい傾向があります。'; };
    return {
      id: id, group: group, chip: name, label: group + name, plain: plain,
      type: 'number', unit: '°', step: 5, init: ref, min: -30, max: 200, better: 'high',
      bilateral: !o.single, ex: ex,
      client: o.single
        ? function (v) { return v < limit ? text('') : null; }
        : sided(function (v) { return v < limit; }, text, {
          pre: o.pre, diff: 15,
          diffText: function (side) { return plain + 'に左右差があります（' + side + 'のほうがかため）。'; }
        })
    };
  }

  // MMT 項目。4以下で「やや弱い傾向」と説明する
  function mmt(group, name, id, plain, ex, single) {
    var text = function (s) { return s + plain + 'の力がやや弱い傾向があります。'; };
    var weak = function (v) { return v <= 4; };
    return {
      id: id, group: group, chip: name, label: group + name, plain: plain + 'の力',
      type: 'scale', min: 0, max: 5, better: 'high', bilateral: !single, ex: ex,
      client: single ? function (v) { return weak(v) ? text('') : null; } : sided(weak, text)
    };
  }

  var PAIN_PLAIN = {
    '頸部': '首', '肩': '肩', '肩甲帯': '肩甲骨まわり', '上肢': '腕', '胸背部': '背中', '腰部': '腰',
    '殿部': 'お尻', '股関節': '股関節', '大腿': '太もも', '膝': '膝', '下腿': 'すね・ふくらはぎ', '足部': '足首・足'
  };
  var opts = function (list) { return list.map(function (x) { return { v: x, label: x }; }); };

  PTA.domains.push({
    id: 'posture',
    label: '姿勢・フィジカル',
    sections: [
      // ------------------------------------------------------------
      {
        id: 'sag', label: '立位姿勢（矢状面）',
        items: [
          { id: 'wnl', label: '著明な偏位なし', type: 'check',
            client: '横から見た姿勢に、大きなくずれはありません。' },
          { id: 'head_fwd', label: '頭部前方位', type: 'check', finding: true,
            client: '頭が肩より前に出やすい姿勢です。首や肩に負担がかかりやすくなります。',
            ex: ['chin_tuck', 'thoracic_ext'] },
          { id: 'round_sh', label: '巻き肩', type: 'check', finding: true,
            client: '肩が内側に巻きやすい姿勢です。',
            ex: ['pec_stretch', 'shoulder_blade'] },
          { id: 'th_kyph', label: '胸椎後弯', type: 'choice', finding: true, options: [
            { v: 'inc', label: '増強', client: '背中が丸くなりやすい姿勢です。', ex: ['thoracic_ext', 'shoulder_blade'] },
            { v: 'flat', label: '平坦', client: '背中のカーブが少なく、まっすぐになりやすい姿勢です。', ex: ['cat_cow'] }
          ] },
          { id: 'lx_lord', label: '腰椎前弯', type: 'choice', finding: true, options: [
            { v: 'inc', label: '増強', client: '腰が反りやすい姿勢です。', ex: ['pelvic_tilt', 'dead_bug'] },
            { v: 'flat', label: '平坦', client: '腰のカーブが少なくなりやすい姿勢です。', ex: ['cat_cow', 'ham_stretch'] }
          ] },
          { id: 'pelvis', label: '骨盤', type: 'choice', finding: true, options: [
            { v: 'ant', label: '前傾', client: '骨盤が前に傾きやすく、反り腰になりやすい姿勢です。', ex: ['pelvic_tilt', 'hipflexor_stretch'] },
            { v: 'post', label: '後傾', client: '骨盤が後ろに傾きやすい姿勢です。', ex: ['ham_stretch', 'pelvic_tilt'] }
          ] },
          { id: 'sway', label: 'スウェイバック', type: 'check', finding: true,
            client: '骨盤が前にスライドし、おなかを突き出すような立ち方になりやすい姿勢です。',
            ex: ['dead_bug', 'bridge'] },
          { id: 'knee_hyper', label: '膝過伸展', type: 'check', bilateral: true, finding: true,
            client: sided(function (v) { return v === true; },
              function (s) { return s + '膝が後ろに反りやすい立ち方です。'; }),
            ex: ['bridge', 'squat'] }
        ]
      },
      // ------------------------------------------------------------
      {
        id: 'front', label: '立位姿勢（前額面）',
        items: [
          { id: 'wnl', label: '著明な左右差なし', type: 'check',
            client: '正面・後ろから見た姿勢に、大きな左右差はありません。' },
          { id: 'head_tilt', label: '頭部傾斜', type: 'choice', finding: true, ex: ['neck_stretch'], options: [
            { v: 'R', label: '右', rec: '頭部右傾斜', client: '頭が右に傾きやすい姿勢です。' },
            { v: 'L', label: '左', rec: '頭部左傾斜', client: '頭が左に傾きやすい姿勢です。' }
          ] },
          { id: 'shoulder', label: '肩の高さ', type: 'choice', finding: true, ex: ['side_stretch', 'shoulder_blade'], options: [
            { v: 'R', label: '右高位', rec: '右肩高位', client: '右肩が高くなりやすい姿勢です。' },
            { v: 'L', label: '左高位', rec: '左肩高位', client: '左肩が高くなりやすい姿勢です。' }
          ] },
          { id: 'pelvis_h', label: '骨盤の高さ', type: 'choice', finding: true, ex: ['side_stretch', 'clam'], options: [
            { v: 'R', label: '右高位', rec: '骨盤右高位', client: '骨盤の右側が高くなりやすい姿勢です。' },
            { v: 'L', label: '左高位', rec: '骨盤左高位', client: '骨盤の左側が高くなりやすい姿勢です。' }
          ] },
          { id: 'trunk_shift', label: '体幹側方偏位', type: 'choice', finding: true, ex: ['side_stretch'], options: [
            { v: 'R', label: '右', rec: '体幹右偏位', client: '上半身が右に寄りやすい姿勢です。' },
            { v: 'L', label: '左', rec: '体幹左偏位', client: '上半身が左に寄りやすい姿勢です。' }
          ] },
          { id: 'knee', label: '膝', type: 'choice', bilateral: true, finding: true,
            options: [{ v: 'varus', label: '内反' }, { v: 'valgus', label: '外反' }],
            client: function (v) {
              return [
                sided(function (x) { return x === 'varus'; },
                  function (s) { return s + '膝が外に開きやすい傾向（O脚傾向）があります。'; },
                  { ex: ['adductor_squeeze'] })(v),
                sided(function (x) { return x === 'valgus'; },
                  function (s) { return s + '膝が内側に入りやすい傾向（X脚傾向）があります。'; },
                  { ex: ['clam', 'squat'] })(v)
              ];
            } },
          { id: 'foot', label: '足部', type: 'choice', bilateral: true, finding: true,
            options: [{ v: 'pron', label: '回内・扁平' }, { v: 'sup', label: '回外・ハイアーチ' }],
            client: function (v) {
              return [
                sided(function (x) { return x === 'pron'; },
                  function (s) { return s + '土踏まずがつぶれやすい傾向があります。'; },
                  { ex: ['short_foot', 'calf_raise'] })(v),
                sided(function (x) { return x === 'sup'; },
                  function (s) { return s + '足の外側に体重が乗りやすい傾向があります。'; },
                  { ex: ['calf_stretch', 'ankle_circle'] })(v)
              ];
            } }
        ]
      },
      // ------------------------------------------------------------
      {
        id: 'pain', label: '疼痛',
        items: [
          { id: 'nrs', label: 'NRS', type: 'scale', min: 0, max: 10, better: 'low', plain: '痛みの強さ（10段階）' },
          { id: 'site', label: '部位', type: 'multi',
            options: opts(['頸部', '肩', '肩甲帯', '上肢', '胸背部', '腰部', '殿部', '股関節', '大腿', '膝', '下腿', '足部']) },
          { id: 'side', label: '左右', type: 'choice',
            options: [{ v: 'R', label: '右' }, { v: 'L', label: '左' }, { v: 'B', label: '両側' }, { v: 'C', label: '正中' }] },
          { id: 'timing', label: '出現', type: 'multi',
            options: opts(['安静時', '動作時', '夜間', '起床時', '運動後']) }
        ],
        // 記録文：NRS 4/10（腰部／右／動作時）
        record: function (get, diff) {
          var nrs = get('nrs'), site = get('site') || [], side = get('side'), timing = get('timing') || [];
          var sideLabel = { R: '右', L: '左', B: '両側', C: '正中' }[side];
          var detail = [site.join('・'), sideLabel, timing.join('・')].filter(Boolean).join('／');
          if (nrs == null) return detail ? '疼痛あり（' + detail + '）' : '';
          return 'NRS ' + nrs + '/10' + diff('nrs') + (detail ? '（' + detail + '）' : '');
        },
        client: function (get) {
          var nrs = get('nrs'), site = get('site') || [], side = get('side');
          if (nrs == null && !site.length) return null;
          if (nrs === 0) return '現在、痛みはありません。';
          var pre = { R: '右の', L: '左の', B: '両側の' }[side] || '';
          var where = site.map(function (x) { return PAIN_PLAIN[x] || x; }).join('・');
          var t = (where ? pre + where + 'に痛みがあります' : '痛みがあります');
          if (nrs != null) t += '（強さ：10段階中 ' + nrs + '）';
          t += '。';
          if (nrs >= 7) t += '痛みが強いので、運動は無理のない範囲で行いましょう。';
          return t;
        }
      },
      // ------------------------------------------------------------
      {
        id: 'rom', label: 'ROM', optional: true,
        items: [
          rom('肩', '屈曲', 'sh_flex', '腕を前から上げる動き', 180, ['wall_angel', 'thoracic_ext']),
          rom('肩', '外転', 'sh_abd', '腕を横から上げる動き', 180, ['wall_angel', 'pec_stretch']),
          rom('肩', '外旋', 'sh_er', '腕を外にひねる動き', 60, ['pec_stretch']),
          rom('肩', '内旋', 'sh_ir', '腕を内にひねる動き', 80, ['shoulder_post']),
          rom('股', '屈曲', 'hip_flex', '股関節を曲げる動き', 125, ['knee_hug']),
          rom('股', '伸展', 'hip_ext', '脚を後ろに引く動き', 15, ['hipflexor_stretch'], { limit: 10 }),
          rom('股', '外転', 'hip_abd', '脚を横に開く動き', 45, ['adductor_stretch']),
          rom('股', '内旋', 'hip_ir', '股関節を内にひねる動き', 45, ['hip_rot']),
          rom('股', '外旋', 'hip_er', '股関節を外にひねる動き', 45, ['hip_rot']),
          rom('膝', '屈曲', 'knee_flex', '膝を曲げる動き', 130, ['quad_stretch']),
          rom('膝', '伸展', 'knee_ext', '膝を伸ばしきる動き', 0, ['ham_stretch'], { limit: -4 }),
          rom('足', '背屈', 'ank_df', '足首を反らす動き', 20, ['calf_stretch'], { limit: 15 }),
          rom('足', '底屈', 'ank_pf', '足首を伸ばす動き', 45, ['ankle_circle']),
          rom('体幹', '屈曲', 'tr_flex', '体を前に曲げる動き', 45, ['cat_cow'], { single: true }),
          rom('体幹', '伸展', 'tr_ext', '体を後ろに反らす動き', 30, ['thoracic_ext'], { single: true }),
          rom('体幹', '回旋', 'tr_rot', '体をひねる動き', 40, ['thoracic_rot'], { pre: PRE_DIR }),
          rom('体幹', '側屈', 'tr_side', '体を横に倒す動き', 50, ['side_stretch'], { pre: PRE_DIR }),
          rom('頸', '回旋', 'nk_rot', '首を回す動き', 60, ['neck_stretch'], { pre: PRE_DIR }),
          rom('頸', '側屈', 'nk_side', '首を横に倒す動き', 50, ['neck_stretch'], { pre: PRE_DIR })
        ]
      },
      // ------------------------------------------------------------
      {
        id: 'mmt', label: 'MMT', optional: true,
        items: [
          mmt('体幹', '屈曲', 'tr_flex', 'おなかの筋肉', ['dead_bug'], true),
          mmt('体幹', '伸展', 'tr_ext', '背中の筋肉', ['bird_dog'], true),
          mmt('股', '屈曲', 'hip_flex', '脚を持ち上げる筋肉', ['dead_bug']),
          mmt('股', '伸展', 'hip_ext', 'お尻の筋肉', ['bridge']),
          mmt('股', '外転', 'hip_abd', 'お尻の横の筋肉', ['clam', 'side_leg']),
          mmt('膝', '伸展', 'knee_ext', '太ももの前の筋肉', ['squat']),
          mmt('膝', '屈曲', 'knee_flex', '太ももの裏の筋肉', ['bridge']),
          mmt('足', '底屈', 'ank_pf', 'ふくらはぎの筋肉', ['calf_raise']),
          mmt('足', '背屈', 'ank_df', 'すねの筋肉', ['toe_raise']),
          mmt('肩', '屈曲', 'sh_flex', '腕を前に上げる筋肉', ['wall_angel']),
          mmt('肩', '外転', 'sh_abd', '腕を横に上げる筋肉', ['wall_angel']),
          mmt('肩', '外旋', 'sh_er', '肩のインナーマッスル', ['shoulder_er']),
          mmt('肩甲骨', '内転', 'scap_add', '肩甲骨を寄せる筋肉', ['shoulder_blade'])
        ]
      },
      // ------------------------------------------------------------
      {
        id: 'flex', label: '柔軟性テスト',
        items: [
          { id: 'ffd', label: 'FFD', hint: '指先〜床。床に届けば0、越えたらマイナス', type: 'number', unit: 'cm',
            step: 1, init: 0, min: -30, max: 80, better: 'low', plain: '前屈（指先から床までの距離）',
            ex: ['ham_stretch', 'cat_cow'],
            client: function (v) {
              if (v <= 0) return { text: '前屈で指先が床に届いており、柔軟性は良好です。', ex: [] };
              if (v < 10) return '前屈であと少しで指先が床に届きます。太ももの裏から腰にかけて、ややかたさがあります。';
              return '前屈で指先が床から離れており、太ももの裏から腰にかけてかたい傾向があります。';
            } },
          { id: 'slr', label: 'SLR', type: 'number', unit: '°', step: 5, init: 70, min: 0, max: 120,
            better: 'high', bilateral: true, plain: '太ももの裏のやわらかさ（脚上げの角度）', ex: ['ham_stretch'],
            client: sided(function (v) { return v < 70; },
              function (s) { return s + '太ももの裏がかたい傾向があります。'; }) },
          { id: 'thomas', label: 'トーマステスト', type: 'choice', bilateral: true,
            plain: '股関節の前のやわらかさ', ex: ['hipflexor_stretch'],
            options: [{ v: 'neg', label: '陰性', score: 1 }, { v: 'pos', label: '陽性', score: 0 }],
            client: sided(function (v) { return v === 'pos'; },
              function (s) { return s + '股関節の前（脚の付け根）がかたい傾向があります。'; }) },
          { id: 'hbd', label: 'HBD', hint: 'かかと〜殿部', type: 'number', unit: 'cm', step: 1, init: 0, min: 0, max: 50,
            better: 'low', bilateral: true, plain: '太ももの前のやわらかさ（かかととお尻の距離）', ex: ['quad_stretch'],
            client: sided(function (v) { return v >= 5; },
              function (s) { return s + '太ももの前がかたい傾向があります。'; }) },
          { id: 'hbb', label: '結帯動作', hint: '母指の到達位置', type: 'choice', bilateral: true,
            plain: '背中に手を回す動き', ex: ['shoulder_post', 'pec_stretch'],
            options: [
              { v: 'thigh', label: '大腿外側', score: 0 }, { v: 'butt', label: '殿部', score: 1 },
              { v: 'sacrum', label: '仙骨', score: 2 }, { v: 'lx', label: '腰椎', score: 3 },
              { v: 'th12', label: 'Th12', score: 4 }, { v: 'th7', label: 'Th7以上', score: 5 }
            ],
            client: sided(function (v) { return v === 'thigh' || v === 'butt' || v === 'sacrum'; },
              function (s) { return s + '背中に手を回す動きがかたい傾向があります。'; }) }
        ]
      },
      // ------------------------------------------------------------
      {
        id: 'balance', label: 'バランス',
        items: [
          { id: 'ols_open', label: '片脚立位（開眼）', type: 'number', unit: '秒', step: 5, init: 30, min: 0, max: 120,
            better: 'high', bilateral: true, plain: '片脚立ちの時間（目を開けて）', ex: ['single_leg_stand', 'clam'],
            client: sided(function (v) { return v < 30; },
              function (s) { return s + '片脚立ちがやや不安定な傾向があります。'; },
              { pre: { R: '右脚での', L: '左脚での', B: '左右とも' } }) },
          { id: 'ols_closed', label: '片脚立位（閉眼）', type: 'number', unit: '秒', step: 1, init: 5, min: 0, max: 120,
            better: 'high', bilateral: true, plain: '片脚立ちの時間（目を閉じて）', ex: ['single_leg_stand', 'short_foot'],
            client: sided(function (v) { return v < 5; },
              function (s) { return s + '目を閉じた片脚立ちが短めです。足裏や体幹でバランスをとる力を高めていきましょう。'; },
              { pre: { R: '右脚での', L: '左脚での', B: '左右とも' } }) }
        ]
      }
    ]
  });
})();
