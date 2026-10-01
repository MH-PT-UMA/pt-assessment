/*
 * 評価領域 ④「脳血管・神経」の定義（麻痺側・BRS・SIAS・MAS）
 *
 * BBS は領域①「姿勢」の「バランス：BBS」を使う（同じ記録を二重に持たないため）。
 * 項目の書き方は posture.js 冒頭のコメントを参照。一度使った id は変えない。
 */
(function () {
  'use strict';
  var PTA = window.PTA = window.PTA || { domains: [], exercises: {} };

  // 点数をつける項目（SIAS）
  function pt(id, label, max, group, say, only) {
    return { id: id, label: label, type: 'scale', min: 0, max: max, better: 'high', group: group, say: say || [], sayOnly: !!only };
  }

  // ---------- BRS：ステージ I〜VI
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  function brs(id, label, plain, say) {
    return {
      id: id, label: label, type: 'choice', plain: plain + '（回復段階）', say: say,
      options: ROMAN.map(function (r, n) {
        return {
          v: 's' + (n + 1), label: r, score: n + 1, say: [String(n + 1), 'ステージ' + (n + 1)],
          client: plain + 'の回復段階は、6段階中' + (n + 1) + 'です。', ex: []
        };
      })
    };
  }

  // ---------- MAS：0, 1, 1+, 2, 3, 4（左右別）
  var MAS_GRADES = [['g0', '0'], ['g1', '1'], ['g1p', '1+'], ['g2', '2'], ['g3', '3'], ['g4', '4']];
  function mas(id, label, plain, ex, say) {
    return {
      id: id, label: label, type: 'choice', bilateral: true, plain: plain + 'のつっぱり（筋緊張）', masPlain: plain, ex: ex, say: say || [],
      options: MAS_GRADES.map(function (gr, n) { return { v: gr[0], label: gr[1], score: 5 - n }; })
    };
  }

  var G1 = '運動機能', G2 = '筋緊張', G3 = '感覚', G4 = '関節可動域・疼痛', G5 = '体幹機能', G6 = '高次脳機能', G7 = '健側機能';

  PTA.domains.push({
    id: 'neuro',
    label: '脳血管・神経',
    tab: '脳血管',
    sections: [
      // ------------------------------------------------------------
      {
        id: 'base', label: '基本情報',
        items: [
          { id: 'side', label: '麻痺側', type: 'choice', say: ['麻痺'], options: [
            { v: 'R', label: '右', rec: '右片麻痺', say: ['右片麻痺'] },
            { v: 'L', label: '左', rec: '左片麻痺', say: ['左片麻痺'] },
            { v: 'B', label: '両側', rec: '両側麻痺', say: ['両方'] }
          ] },
          { id: 'type', label: '病型', type: 'choice', options: [
            { v: 'ci', label: '脳梗塞', rec: '脳梗塞' },
            { v: 'ich', label: '脳出血', rec: '脳出血' },
            { v: 'sah', label: 'くも膜下出血', rec: 'くも膜下出血' },
            { v: 'other', label: 'その他', rec: '病型その他' }
          ] }
        ]
      },
      // ------------------------------------------------------------
      {
        id: 'brs', label: 'BRS', say: ['brs', 'ブルンストロームステージ', 'ブルンストローム'],
        items: [
          brs('ue', '上肢', '腕の動き', ['上肢ステージ']),
          brs('hand', '手指', '手指の動き', ['手指ステージ']),
          brs('le', '下肢', '脚の動き', ['下肢ステージ'])
        ],
        // 記録文：BRS 上肢III・手指II・下肢IV
        record: function (get) {
          var parts = this.items.map(function (i) {
            var v = get(i.id);
            if (!v) return '';
            return i.label + i.options.filter(function (o) { return o.v === v; })[0].label;
          }).filter(Boolean);
          return parts.length ? 'BRS ' + parts.join('・') : '';
        }
      },
      // ------------------------------------------------------------
      {
        id: 'sias', label: 'SIAS', say: ['sias', 'サイアス'],
        score: {
          label: 'SIAS', plain: '脳卒中後の機能検査（SIAS）の合計', detail: 'all',
          hint: '運動機能 0〜5点、その他 0〜3点・76点満点（22項目）',
          client: function (sc) {
            if (!sc.complete) return null;
            return { text: '脳卒中後の機能検査（SIAS）は76点中' + sc.sum + '点でした。', ex: [] };
          }
        },
        items: [
          pt('knee_mouth', '上肢近位（膝・口テスト）', 5, G1, ['膝口テスト', '膝口', '上肢近位']),
          pt('finger', '上肢遠位（手指テスト）', 5, G1, ['手指テスト', '上肢遠位']),
          pt('hip_flex', '下肢近位（股屈曲テスト）', 5, G1, ['股屈曲テスト', '下肢近位股']),
          pt('knee_ext', '下肢近位（膝伸展テスト）', 5, G1, ['膝伸展テスト', '下肢近位膝']),
          pt('foot_pat', '下肢遠位（足パット・テスト）', 5, G1, ['足パットテスト', '足パット', '下肢遠位']),
          pt('tone_ue', '上肢筋緊張', 3, G2),
          pt('tone_le', '下肢筋緊張', 3, G2),
          pt('dtr_ue', '上肢腱反射', 3, G2),
          pt('dtr_le', '下肢腱反射', 3, G2),
          pt('touch_ue', '上肢触覚', 3, G3),
          pt('touch_le', '下肢触覚', 3, G3),
          pt('pos_ue', '上肢位置覚', 3, G3),
          pt('pos_le', '下肢位置覚', 3, G3),
          pt('rom_ue', '上肢関節可動域', 3, G4, ['上肢可動域']),
          pt('rom_le', '下肢関節可動域', 3, G4, ['下肢可動域']),
          pt('pain', '疼痛', 3, G4, ['sias疼痛'], true),
          pt('abdominal', '腹筋力', 3, G5),
          pt('vertical', '垂直性', 3, G5),
          pt('visuo', '視空間認知', 3, G6),
          pt('speech', '言語', 3, G6, ['言語機能']),
          pt('grip', '健側握力', 3, G7, ['握力']),
          pt('quad', '健側大腿四頭筋力', 3, G7, ['健側四頭筋', '健側膝伸展'])
        ]
      },
      // ------------------------------------------------------------
      {
        id: 'mas', label: 'MAS', optional: true, say: ['mas', 'アシュワース', 'モディファイドアシュワース'],
        items: [
          mas('sh_add', '肩内転筋', '肩まわり', ['pec_stretch']),
          mas('el_flex', '肘屈筋', 'ひじを曲げる筋肉', ['elbow_bend'], ['上腕二頭筋']),
          mas('el_ext', '肘伸筋', 'ひじを伸ばす筋肉', ['elbow_bend'], ['上腕三頭筋']),
          mas('wr_flex', '手関節屈筋', '手首', ['wrist_stretch'], ['手首屈筋']),
          mas('fing_flex', '手指屈筋', '手指', ['wrist_stretch']),
          mas('hip_add', '股内転筋', '内もも', ['adductor_stretch']),
          mas('knee_flex', '膝屈筋', '太ももの裏', ['ham_stretch'], ['ハムストリングス']),
          mas('knee_ext', '膝伸筋', '太ももの前', ['quad_stretch'], ['大腿四頭筋']),
          mas('ank_pf', '足底屈筋', 'ふくらはぎ', ['calf_stretch'], ['下腿三頭筋'])
        ],
        // 1以上の筋を左右ごとにまとめて伝える
        client: function (get) {
          var hit = { R: [], L: [] }, ex = [];
          this.items.forEach(function (i) {
            var v = get(i.id);
            if (!v) return;
            ['R', 'L'].forEach(function (k) {
              if (v[k] && v[k] !== 'g0') { hit[k].push(i.masPlain); if (ex.indexOf(i.ex[0]) < 0) ex.push(i.ex[0]); }
            });
          });
          var uniq = function (a) { return a.filter(function (x, n) { return a.indexOf(x) === n; }); };
          return [['R', '右'], ['L', '左']].map(function (s) {
            var list = uniq(hit[s[0]]);
            if (!list.length) return null;
            return { text: s[1] + 'の' + list.join('・') + 'に、つっぱり（筋肉のこわばり）がみられます。ゆっくりとしたストレッチがおすすめです。', ex: ex };
          });
        }
      }
    ]
  });

  PTA.voiceFixes = (PTA.voiceFixes || []).concat([
    ['1プラス', '1+'], ['サイアス', 'sias'], ['エムエーエス', 'mas'], ['ビーアールエス', 'brs'],
    ['膝・口', '膝口'], ['足パット・テスト', '足パットテスト'], ['まひ', '麻痺']
  ]);
})();
