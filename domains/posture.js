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

  // 音声入力での関節の呼び方（「股関節屈曲」「股屈曲」「股関節の屈曲」のどれでも通じるようにする）
  var JOINT = {
    '肩': ['肩', '肩関節'], '股': ['股', '股関節'], '膝': ['膝', '膝関節', 'ひざ'], '足': ['足', '足関節', '足首'],
    '体幹': ['体幹'], '頸': ['頸', '頸部', '首'], '肩甲骨': ['肩甲骨'], '肩甲帯': ['肩甲帯'],
    '肘': ['肘', '肘関節', 'ひじ'], '前腕': ['前腕'], '手': ['手', '手関節', '手首'], '母趾': ['母趾', '足の親指']
  };
  function says(group, name) {
    var out = [];
    (JOINT[group] || [group]).forEach(function (j) { out.push(j + name, j + 'の' + name); });
    return out;
  }

  // ROM 項目。ref は参考可動域、ref の8割未満（または o.limit 未満）で「かたい傾向」と説明する
  function rom(group, name, id, plain, ref, ex, o) {
    o = o || {};
    var limit = o.limit != null ? o.limit : ref * 0.8;
    var text = function (s) { return s + plain + 'がややかたい傾向があります。'; };
    return {
      id: id, group: group, chip: name, label: group + name, plain: plain, say: says(group, name).concat(o.say || []),
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
      id: id, group: group, chip: name, label: group + name, plain: plain + 'の力', say: says(group, name),
      type: 'scale', min: 0, max: 5, better: 'high', bilateral: !single, ex: ex,
      client: single ? function (v) { return weak(v) ? text('') : null; } : sided(weak, text)
    };
  }

  // 点数をつける項目（BBS・BESTest）
  function pt(id, label, max, group, bilateral) {
    return { id: id, label: label, type: 'scale', min: 0, max: max, better: 'high', group: group, bilateral: !!bilateral };
  }
  // BESTest の6セクション（小計の単位）と、クライアント向けの言い換え
  var B1 = 'I 生体力学的制約', B2 = 'II 安定性限界・垂直性', B3 = 'III 予測的姿勢調節',
    B4 = 'IV 反応的姿勢制御', B5 = 'V 感覚機能', B6 = 'VI 歩行安定性';
  var BEST_PLAIN = {};
  BEST_PLAIN[B1] = { plain: '筋力や柔軟性など、からだの土台', ex: ['calf_raise', 'squat'] };
  BEST_PLAIN[B2] = { plain: '体を傾けたり手を伸ばしたりできる範囲', ex: ['side_stretch', 'single_leg_stand'] };
  BEST_PLAIN[B3] = { plain: '動き出すときの姿勢の準備', ex: ['calf_raise', 'single_leg_stand'] };
  BEST_PLAIN[B4] = { plain: 'バランスを崩したときの立て直し', ex: ['single_leg_stand', 'squat'] };
  BEST_PLAIN[B5] = { plain: '目を閉じたときや、やわらかい床の上での安定', ex: ['single_leg_stand', 'short_foot'] };
  BEST_PLAIN[B6] = { plain: '歩いているときのバランス', ex: ['squat', 'calf_raise'] };

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
          // 数字は参考可動域（日本整形外科学会・日本リハビリテーション医学会の表示法）
          rom('頸', '屈曲', 'nk_flex', '首を前に倒す動き', 60, ['neck_stretch', 'chin_tuck'], { single: true }),
          rom('頸', '伸展', 'nk_ext', '首を後ろに倒す動き', 50, ['chin_tuck', 'thoracic_ext'], { single: true }),
          rom('頸', '回旋', 'nk_rot', '首を回す動き', 60, ['neck_stretch'], { pre: PRE_DIR }),
          rom('頸', '側屈', 'nk_side', '首を横に倒す動き', 50, ['neck_stretch'], { pre: PRE_DIR }),
          rom('肩甲帯', '屈曲', 'sg_flex', '肩を前に出す動き', 20, ['shoulder_blade']),
          rom('肩甲帯', '伸展', 'sg_ext', '肩を後ろに引く動き', 20, ['pec_stretch', 'shoulder_blade']),
          rom('肩甲帯', '挙上', 'sg_elev', '肩をすくめる動き', 20, ['shoulder_blade']),
          rom('肩甲帯', '下制', 'sg_dep', '肩を下げる動き', 10, ['neck_stretch']),
          rom('肩', '屈曲', 'sh_flex', '腕を前から上げる動き', 180, ['wall_angel', 'thoracic_ext']),
          rom('肩', '伸展', 'sh_ext', '腕を後ろに引く動き', 50, ['pec_stretch']),
          rom('肩', '外転', 'sh_abd', '腕を横から上げる動き', 180, ['wall_angel', 'pec_stretch']),
          rom('肩', '外旋', 'sh_er', '腕を外にひねる動き', 60, ['pec_stretch']),
          rom('肩', '内旋', 'sh_ir', '腕を内にひねる動き', 80, ['shoulder_post']),
          rom('肩', '外旋2nd', 'sh_er2', '腕を上げた位置で外にひねる動き', 90, ['pec_stretch'], { say: ['セカンド外旋', '肩セカンド外旋'] }),
          rom('肩', '内旋2nd', 'sh_ir2', '腕を上げた位置で内にひねる動き', 70, ['shoulder_post'], { say: ['セカンド内旋', '肩セカンド内旋'] }),
          rom('肩', '水平屈曲', 'sh_hflex', '腕を胸の前に寄せる動き', 135, ['shoulder_post']),
          rom('肩', '水平伸展', 'sh_hext', '腕を横から後ろに開く動き', 30, ['pec_stretch']),
          rom('肘', '屈曲', 'el_flex', 'ひじを曲げる動き', 145, ['elbow_bend']),
          rom('肘', '伸展', 'el_ext', 'ひじを伸ばしきる動き', 5, ['elbow_bend'], { limit: -4 }),
          rom('前腕', '回内', 'fa_pro', '手のひらを下に向ける動き', 90, ['wrist_stretch']),
          rom('前腕', '回外', 'fa_sup', '手のひらを上に向ける動き', 90, ['wrist_stretch']),
          rom('手', '掌屈', 'wr_flex', '手首を手のひら側に曲げる動き', 90, ['wrist_stretch']),
          rom('手', '背屈', 'wr_ext', '手首を反らす動き', 70, ['wrist_stretch']),
          rom('手', '橈屈', 'wr_rad', '手首を親指側に倒す動き', 25, ['wrist_stretch']),
          rom('手', '尺屈', 'wr_uln', '手首を小指側に倒す動き', 55, ['wrist_stretch']),
          rom('体幹', '屈曲', 'tr_flex', '体を前に曲げる動き', 45, ['cat_cow'], { single: true }),
          rom('体幹', '伸展', 'tr_ext', '体を後ろに反らす動き', 30, ['thoracic_ext'], { single: true }),
          rom('体幹', '回旋', 'tr_rot', '体をひねる動き', 40, ['thoracic_rot'], { pre: PRE_DIR }),
          rom('体幹', '側屈', 'tr_side', '体を横に倒す動き', 50, ['side_stretch'], { pre: PRE_DIR }),
          rom('股', '屈曲', 'hip_flex', '股関節を曲げる動き', 125, ['knee_hug']),
          rom('股', '伸展', 'hip_ext', '脚を後ろに引く動き', 15, ['hipflexor_stretch'], { limit: 10 }),
          rom('股', '外転', 'hip_abd', '脚を横に開く動き', 45, ['adductor_stretch']),
          rom('股', '内転', 'hip_add', '脚を内側に閉じる動き', 20, ['hip_rot']),
          rom('股', '内旋', 'hip_ir', '股関節を内にひねる動き', 45, ['hip_rot']),
          rom('股', '外旋', 'hip_er', '股関節を外にひねる動き', 45, ['hip_rot']),
          rom('膝', '屈曲', 'knee_flex', '膝を曲げる動き', 130, ['quad_stretch']),
          rom('膝', '伸展', 'knee_ext', '膝を伸ばしきる動き', 0, ['ham_stretch'], { limit: -4 }),
          rom('足', '背屈', 'ank_df', '足首を反らす動き', 20, ['calf_stretch'], { limit: 15 }),
          rom('足', '底屈', 'ank_pf', '足首を伸ばす動き', 45, ['ankle_circle']),
          rom('足', '内がえし', 'ank_inv', '足の裏を内側に向ける動き', 30, ['ankle_circle']),
          rom('足', '外がえし', 'ank_ev', '足の裏を外側に向ける動き', 20, ['ankle_circle']),
          rom('母趾', '伸展', 'toe_ext', '足の親指を反らす動き', 60, ['toe_stretch']),
          rom('母趾', '屈曲', 'toe_flex', '足の親指を曲げる動き', 35, ['toe_stretch'])
        ]
      },
      // ------------------------------------------------------------
      {
        id: 'mmt', label: 'MMT', optional: true,
        items: [
          mmt('頸', '屈曲', 'nk_flex', '首の前の筋肉', ['chin_tuck'], true),
          mmt('頸', '伸展', 'nk_ext', '首の後ろの筋肉', ['chin_tuck'], true),
          mmt('肩甲骨', '外転', 'scap_abd', '肩甲骨を前に押し出す筋肉', ['wall_pushup']),
          mmt('肩甲骨', '挙上', 'scap_elev', '肩をすくめる筋肉', ['shoulder_blade']),
          mmt('肩甲骨', '内転', 'scap_add', '肩甲骨を寄せる筋肉', ['shoulder_blade']),
          mmt('肩甲骨', '下制内転', 'scap_dep', '肩甲骨を下げて寄せる筋肉', ['wall_angel', 'shoulder_blade']),
          mmt('肩', '屈曲', 'sh_flex', '腕を前に上げる筋肉', ['wall_angel']),
          mmt('肩', '伸展', 'sh_ext', '腕を後ろに引く筋肉', ['shoulder_blade']),
          mmt('肩', '外転', 'sh_abd', '腕を横に上げる筋肉', ['wall_angel']),
          mmt('肩', '外旋', 'sh_er', '肩のインナーマッスル', ['shoulder_er']),
          mmt('肩', '内旋', 'sh_ir', '腕を内にひねる筋肉', ['wall_pushup']),
          mmt('肩', '水平外転', 'sh_habd', '腕を横に開く筋肉', ['shoulder_blade']),
          mmt('肩', '水平内転', 'sh_hadd', '胸の筋肉', ['wall_pushup']),
          mmt('肘', '屈曲', 'el_flex', 'ひじを曲げる筋肉', ['arm_curl']),
          mmt('肘', '伸展', 'el_ext', 'ひじを伸ばす筋肉', ['wall_pushup']),
          mmt('前腕', '回内', 'fa_pro', '手のひらを下に返す筋肉', ['wrist_curl']),
          mmt('前腕', '回外', 'fa_sup', '手のひらを上に返す筋肉', ['wrist_curl']),
          mmt('手', '掌屈', 'wr_flex', '手首を曲げる筋肉', ['wrist_curl']),
          mmt('手', '背屈', 'wr_ext', '手首を反らす筋肉', ['wrist_curl']),
          mmt('体幹', '屈曲', 'tr_flex', 'おなかの筋肉', ['dead_bug'], true),
          mmt('体幹', '伸展', 'tr_ext', '背中の筋肉', ['bird_dog'], true),
          mmt('体幹', '回旋', 'tr_rot', '体をひねる筋肉', ['dead_bug', 'bird_dog']),
          mmt('股', '屈曲', 'hip_flex', '脚を持ち上げる筋肉', ['dead_bug']),
          mmt('股', '伸展', 'hip_ext', 'お尻の筋肉', ['bridge']),
          mmt('股', '外転', 'hip_abd', 'お尻の横の筋肉', ['clam', 'side_leg']),
          mmt('股', '内転', 'hip_add', '内ももの筋肉', ['adductor_squeeze']),
          mmt('股', '外旋', 'hip_er', '股関節を外にひねる筋肉', ['clam']),
          mmt('股', '内旋', 'hip_ir', '股関節を内にひねる筋肉', ['hip_rot']),
          mmt('膝', '伸展', 'knee_ext', '太ももの前の筋肉', ['squat']),
          mmt('膝', '屈曲', 'knee_flex', '太ももの裏の筋肉', ['bridge']),
          mmt('足', '底屈', 'ank_pf', 'ふくらはぎの筋肉', ['calf_raise']),
          mmt('足', '背屈', 'ank_df', 'すねの筋肉', ['toe_raise']),
          mmt('足', '内がえし', 'ank_inv', '足首を内側から支える筋肉', ['short_foot']),
          mmt('足', '外がえし', 'ank_ev', '足首を外側から支える筋肉', ['single_leg_stand', 'calf_raise'])
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
      },
      // ------------------------------------------------------------
      // score を付けたセクションは合計点（group ごとの小計）を自動で出す
      {
        id: 'bbs', label: 'バランス：BBS',
        score: {
          label: 'BBS', plain: 'バランス検査（BBS）の合計', hint: '各項目 0〜4点・56点満点',
          client: function (sc) {
            if (!sc.complete) return null;
            var t = 'バランス検査（BBS）は56点中' + sc.sum + '点でした。';
            if (sc.sum >= 46) return { text: t + 'バランス能力は良好です。', ex: [] };
            if (sc.sum >= 41) return { text: t + 'おおむね良好ですが、やや不安定になる場面があります。', ex: ['single_leg_stand', 'calf_raise'] };
            if (sc.sum >= 21) return { text: t + 'ふらつきやすい場面があります。転倒に気をつけながら、バランス練習を続けていきましょう。', ex: ['single_leg_stand', 'squat', 'calf_raise'] };
            return { text: t + 'バランスを崩しやすい状態です。立ち座りや移動のときは、支えを使って安全に行いましょう。', ex: ['squat', 'calf_raise'] };
          }
        },
        items: [
          pt('b01', '1 立ち上がり（椅子座位→立位）', 4),
          pt('b02', '2 立位保持', 4),
          pt('b03', '3 座位保持（背もたれなし）', 4),
          pt('b04', '4 着座（立位→座位）', 4),
          pt('b05', '5 移乗', 4),
          pt('b06', '6 閉眼立位', 4),
          pt('b07', '7 閉脚立位', 4),
          pt('b08', '8 上肢前方リーチ', 4),
          pt('b09', '9 床から物を拾う', 4),
          pt('b10', '10 後方を振り向く（左右）', 4),
          pt('b11', '11 360°回転', 4),
          pt('b12', '12 段差への足載せ（交互）', 4),
          pt('b13', '13 タンデム立位', 4),
          pt('b14', '14 片脚立位', 4)
        ]
      },
      // ------------------------------------------------------------
      {
        id: 'bestest', label: 'バランス：BESTest',
        score: {
          label: 'BESTest', percent: true, plain: 'バランス検査（BESTest）の合計',
          hint: '各項目 0〜3点・108点満点（36項目）',
          client: function (sc) {
            if (!sc.complete) return null;
            var t = 'バランス検査（BESTest）は108点中' + sc.sum + '点（' + Math.round(sc.sum / sc.max * 100) + '%）でした。';
            var worst = null;
            sc.groups.forEach(function (g) {
              var r = g.sum / g.max;
              if (r < 0.85 && (!worst || r < worst.sum / worst.max)) worst = g; // 85%未満の領域だけ「苦手」と伝える
            });
            if (!worst) return { text: t + '全体に良好です。', ex: [] };
            var info = BEST_PLAIN[worst.label] || {};
            return { text: t + (info.plain ? 'なかでも「' + info.plain + '」が苦手な傾向です。' : ''), ex: info.ex || ['single_leg_stand'] };
          }
        },
        items: [
          pt('e01', '1 支持基底面', 3, B1),
          pt('e02', '2 重心アライメント', 3, B1),
          pt('e03', '3 足関節の筋力と可動域', 3, B1),
          pt('e04', '4 股関節・体幹側方の筋力', 3, B1),
          pt('e05', '5 床への座り込みと立ち上がり', 3, B1),
          pt('e06a', '6 座位側方リーチ', 3, B2, true),
          pt('e06b', '6 座位垂直性', 3, B2, true),
          pt('e07', '7 前方ファンクショナルリーチ', 3, B2),
          pt('e08', '8 側方ファンクショナルリーチ', 3, B2, true),
          pt('e09', '9 座位からの立ち上がり', 3, B3),
          pt('e10', '10 つま先立ち', 3, B3),
          pt('e11', '11 片脚立位', 3, B3, true),
          pt('e12', '12 交互の段差タッチ', 3, B3),
          pt('e13', '13 立位での上肢挙上', 3, B3),
          pt('e14', '14 その場での反応（前方）', 3, B4),
          pt('e15', '15 その場での反応（後方）', 3, B4),
          pt('e16', '16 代償的ステップ（前方）', 3, B4),
          pt('e17', '17 代償的ステップ（後方）', 3, B4),
          pt('e18', '18 代償的ステップ（側方）', 3, B4, true),
          pt('e19a', '19A 開眼・固い床', 3, B5),
          pt('e19b', '19B 閉眼・固い床', 3, B5),
          pt('e19c', '19C 開眼・フォーム', 3, B5),
          pt('e19d', '19D 閉眼・フォーム', 3, B5),
          pt('e20', '20 傾斜台・閉眼', 3, B5),
          pt('e21', '21 平地歩行', 3, B6),
          pt('e22', '22 歩行速度の変化', 3, B6),
          pt('e23', '23 頭部回旋を伴う歩行', 3, B6),
          pt('e24', '24 歩行中のピボットターン', 3, B6),
          pt('e25', '25 障害物またぎ', 3, B6),
          pt('e26', '26 TUG', 3, B6),
          pt('e27', '27 二重課題TUG', 3, B6)
        ]
      }
    ]
  });

  // ==================================================================
  // 音声入力の語彙
  //   sections … セクションの呼び名（「MMT」と言うと以降はMMTの項目として読む）
  //   items    … 'セクションid.項目id': { say: 別の言い方, only: true で項目名そのものは使わない,
  //              direct: {言葉: 値} その言葉だけで値まで決まるもの, opts: {選択肢の値: 別の言い方} }
  // 項目名（label）と選択肢名は、書かなくても自動で使われる。
  // ==================================================================
  var VOICE_SECTIONS = {
    sag: ['矢状面'], front: ['前額面'], pain: ['疼痛', '痛み'], rom: ['rom', '可動域', '関節可動域'],
    mmt: ['mmt', '筋力'], flex: ['柔軟性'], balance: ['バランス'], bbs: ['bbs', 'バーグ'], bestest: ['bestest', 'ベスト']
  };
  var CURVE = { inc: ['増加', '強い'], flat: ['フラット', '減少'] };
  var HIGH = { R: ['右が高い', '右高い', '右'], L: ['左が高い', '左高い', '左'] };
  var VOICE_ITEMS = {
    'sag.wnl': { say: ['偏位なし', '矢状面問題なし'] },
    'sag.head_fwd': { say: ['頭部前方', 'フォワードヘッド'] },
    'sag.round_sh': { say: ['巻肩', 'まき肩'] },
    'sag.th_kyph': { say: ['胸椎'], opts: CURVE },
    'sag.lx_lord': { say: ['腰椎'], opts: CURVE },
    'sag.sway': { say: ['スウェーバック', 'スエイバック'] },
    'sag.knee_hyper': { say: ['反張膝', '膝の過伸展'] },
    'front.wnl': { say: ['左右差なし'] },
    'front.shoulder': { say: ['肩高さ'], opts: HIGH },
    'front.pelvis_h': { say: ['骨盤高さ'], opts: HIGH },
    'front.trunk_shift': { say: ['体幹偏位', '体幹シフト'] },
    'front.knee': { only: true, say: ['膝アライメント'],
      direct: { 'o脚': 'varus', 'x脚': 'valgus', '膝内反': 'varus', '膝外反': 'valgus', '内反膝': 'varus', '外反膝': 'valgus' } },
    'front.foot': { direct: { '扁平足': 'pron', '回内足': 'pron', 'ハイアーチ': 'sup', '回外足': 'sup' },
      opts: { pron: ['回内', '扁平'], sup: ['回外', '甲高'] } },
    'pain.nrs': { say: ['痛みの強さ', '疼痛スケール'] },
    'pain.site': { opts: {
      '頸部': ['首', '頸'], '肩甲帯': ['肩甲骨'], '上肢': ['腕'], '胸背部': ['背中', '背部'], '腰部': ['腰'],
      '殿部': ['お尻', 'おしり'], '股関節': ['股'], '大腿': ['太もも', 'もも'], '膝': ['ひざ'],
      '下腿': ['すね', 'ふくらはぎ'], '足部': ['足首', '足'] } },
    'pain.side': { only: true, opts: { B: ['両方', '左右'], C: ['真ん中', '中央'] } },
    'pain.timing': { opts: { '安静時': ['安静'], '動作時': ['動作', '動いた時'], '夜間': ['夜'], '起床時': ['起床', '朝'] } },
    'flex.ffd': { say: ['指床間距離', '前屈'] },
    'flex.slr': { say: ['下肢伸展挙上'] },
    'flex.thomas': { say: ['トーマス'], opts: { neg: ['ネガティブ'], pos: ['ポジティブ'] } },
    'flex.hbd': { say: ['踵殿間距離', '尻上がり'] },
    'flex.hbb': { say: ['結帯'], opts: { butt: ['お尻'], th12: ['第12胸椎'], th7: ['th7', '第7胸椎'] } },
    'balance.ols_open': { say: ['片脚立位開眼', '開眼片脚立位', '片脚立位', '開眼'] },
    'balance.ols_closed': { say: ['片脚立位閉眼', '閉眼片脚立位', '閉眼'] },
    'bestest.e06a': { say: ['6番リーチ', '座位リーチ'] },
    'bestest.e06b': { say: ['6番垂直', '垂直性'] }
  };
  var domain = PTA.domains[PTA.domains.length - 1];
  domain.sections.forEach(function (s) {
    s.say = VOICE_SECTIONS[s.id] || [];
    if (s.id === 'pain') s.voiceLoose = true; // 「NRS 4 腰 動作時」のように、項目名なしで選択肢を言える
    s.items.forEach(function (i) {
      var v = VOICE_ITEMS[s.id + '.' + i.id];
      if (!v) return;
      i.say = (i.say || []).concat(v.say || []);
      if (v.only) i.sayOnly = true;
      if (v.direct) i.direct = v.direct;
      (i.options || []).forEach(function (o) { if (v.opts && v.opts[o.v]) o.say = v.opts[o.v]; });
    });
  });

  // 聞き間違い・表記ゆれの直し（左を右に置き換える）。うまく入らない言葉があればここに足す
  PTA.voiceFixes = (PTA.voiceFixes || []).concat([
    ['外線', '外旋'], ['凱旋', '外旋'], ['内線', '内旋'], ['内戦', '内旋'], ['進展', '伸展'], ['親展', '伸展'],
    ['回線', '回旋'], ['開戦', '回旋'], ['外点', '外転'], ['内点', '内転'], ['即屈', '側屈'], ['測屈', '側屈'],
    ['低屈', '底屈'], ['廃屈', '背屈'], ['古関節', '股関節'], ['個関節', '股関節'], ['子関節', '股関節'], ['こ関節', '股関節'],
    ['頚', '頸'], ['警部', '頸部'], ['臀', '殿'], ['後湾', '後弯'], ['前湾', '前弯'], ['後彎', '後弯'], ['前彎', '前弯'],
    ['片足立ち', '片脚立位'], ['片脚立ち', '片脚立位'], ['片足立位', '片脚立位'], ['偏平', '扁平'],
    ['エヌアールエス', 'nrs'], ['エスエルアール', 'slr'], ['エフエフディー', 'ffd'], ['エイチビーディー', 'hbd'],
    ['エムエムティー', 'mmt'], ['アールオーエム', 'rom'], ['ビービーエス', 'bbs'], ['ベステスト', 'bestest'], ['ベストテスト', 'bestest'],
    ['オー脚', 'o脚'], ['エックス脚', 'x脚'],
    ['海外', '回外'], ['将屈', '掌屈'], ['小屈', '掌屈'], ['消屈', '掌屈'], ['釈屈', '尺屈'], ['投屈', '橈屈'], ['等屈', '橈屈'],
    ['内返し', '内がえし'], ['外返し', '外がえし'], ['うちがえし', '内がえし'], ['そとがえし', '外がえし'],
    ['母指', '母趾'], ['拇趾', '母趾'], ['拇指', '母趾'], ['セカンドポジション', 'セカンド'], ['2nd', 'セカンド'],
    // 「腰の痛み」→「痛み 腰」の順に直す
    [/(首|頸部|肩甲骨|肩甲帯|肩|腕|上肢|背中|背部|胸背部|腰部|腰|お尻|殿部|股関節|太もも|大腿|膝|ひざ|すね|ふくらはぎ|下腿|足首|足部|足)(の|に|が)?(痛み|疼痛)/g, '痛み$1']
  ]);
})();
