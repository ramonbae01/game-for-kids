/* =========================================================
   K-Chess 캐릭터 — 한국 전래 이야기 속 친구들 (모두 직접 그린 오리지널 그림)
   각 캐릭터는 draw(t) 함수로 그려요. t = 팀 색 {main, dark, light}
   그림 영역: 0~100, 발바닥은 y≈86 (받침대는 바깥에서 그려요)
   ========================================================= */
(function(){
  const O = '#2b2340';               // 외곽선
  const sw = 'stroke="' + O + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
  const sw2 = 'stroke="' + O + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';

  // 눈 두 개 (반짝이 포함)
  function eyes(cx, cy, gap, r){
    r = r || 3.2;
    return `<ellipse cx="${cx-gap}" cy="${cy}" rx="${r*.85}" ry="${r}" fill="${O}"/>
      <ellipse cx="${cx+gap}" cy="${cy}" rx="${r*.85}" ry="${r}" fill="${O}"/>
      <circle cx="${cx-gap+r*.35}" cy="${cy-r*.4}" r="${r*.33}" fill="#fff"/>
      <circle cx="${cx+gap+r*.35}" cy="${cy-r*.4}" r="${r*.33}" fill="#fff"/>`;
  }
  function blush(cx, cy, gap){
    return `<ellipse cx="${cx-gap}" cy="${cy}" rx="3.6" ry="2.2" fill="#ff8fa3" opacity=".75"/>
      <ellipse cx="${cx+gap}" cy="${cy}" rx="3.6" ry="2.2" fill="#ff8fa3" opacity=".75"/>`;
  }
  function smile(cx, cy, w){
    w = w || 5;
    return `<path d="M${cx-w} ${cy} Q${cx} ${cy+w*1.1} ${cx+w} ${cy}" fill="none" ${sw2}/>`;
  }
  // 한복 저고리 몸통 (팀 색)
  function hanbok(t, x1, x2, top, collar){
    return `<path d="M${x1} 86 Q${x1} ${top+4} 50 ${top} Q${x2} ${top+4} ${x2} 86 Z" fill="${t.main}" ${sw}/>
      <path d="M50 ${top+1} L${50-8} ${top+12} M50 ${top+1} L${50+8} ${top+12}" fill="none" stroke="${collar || '#fff'}" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M${50-2} ${top+15} q-6 4 -8 12 M${50+2} ${top+15} q6 4 8 12" fill="none" stroke="${t.light}" stroke-width="2.6" stroke-linecap="round"/>`;
  }

  const DRAW = {

    /* 호랑이 */
    tiger(t){
      return `
      <path d="M26 86 Q24 66 50 64 Q76 66 74 86 Z" fill="#f7a23b" ${sw}/>
      <path d="M40 86 Q42 74 50 73 Q58 74 60 86 Z" fill="#fff4e0"/>
      <path d="M30 74 l7 2 M70 74 l-7 2 M28 81 l7 1 M72 81 l-7 1" ${sw2}/>
      <path d="M36 66 Q50 74 64 66 L62 72 Q50 78 38 72 Z" fill="${t.main}" ${sw2}/>
      <circle cx="22" cy="20" r="9" fill="#f7a23b" ${sw}/><circle cx="22" cy="20" r="4" fill="#ffd2b3"/>
      <circle cx="78" cy="20" r="9" fill="#f7a23b" ${sw}/><circle cx="78" cy="20" r="4" fill="#ffd2b3"/>
      <ellipse cx="50" cy="40" rx="31" ry="27" fill="#f7a23b" ${sw}/>
      <path d="M50 14 l-3 8 M42 15 l1 7 M58 15 l-1 7" ${sw2}/>
      <path d="M20 36 l8 2 M20 44 l8 0 M80 36 l-8 2 M80 44 l-8 0" ${sw2}/>
      <ellipse cx="50" cy="52" rx="15" ry="11" fill="#fff4e0" ${sw2}/>
      ${eyes(50, 37, 11, 3.6)}
      <path d="M46 47 Q50 44 54 47 Q50 52 46 47 Z" fill="${O}"/>
      <path d="M44 53 Q47 57 50 53 Q53 57 56 53" fill="none" ${sw2}/>
      ${blush(50, 48, 19)}`;
    },

    /* 도깨비 대장 */
    dokkaebi(t){
      return `
      <path d="M24 86 Q22 60 50 58 Q78 60 76 86 Z" fill="#6cc3a5" ${sw}/>
      <path d="M30 70 L70 70 L66 86 L34 86 Z" fill="#f2c94c" ${sw2}/>
      <path d="M36 72 l3 6 M46 72 l2 7 M56 72 l2 6 M64 72 l1 5" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M34 60 Q50 66 66 60" fill="none" stroke="${t.main}" stroke-width="5" stroke-linecap="round"/>
      <path d="M82 82 L72 40" stroke="#8a5a2b" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="70" cy="34" rx="9" ry="13" transform="rotate(-14 70 34)" fill="#a8743f" ${sw}/>
      <circle cx="66" cy="28" r="1.8" fill="${O}"/><circle cx="73" cy="32" r="1.8" fill="${O}"/><circle cx="68" cy="38" r="1.8" fill="${O}"/>
      <ellipse cx="44" cy="38" rx="25" ry="23" fill="#6cc3a5" ${sw}/>
      <path d="M38 17 L44 2 L50 17 Z" fill="#fff1b8" ${sw}/>
      <path d="M22 30 Q20 12 34 14 Q30 22 36 22 Q38 10 48 14 Q48 22 56 18 Q62 12 66 24 Q60 22 58 28" fill="#3b2a55" ${sw2}/>
      ${eyes(44, 36, 9, 3.8)}
      <path d="M34 47 Q44 56 54 47 Z" fill="#fff" ${sw2}/>
      <path d="M37 47 l2 4 l2 -4 M47 47 l2 4 l2 -4" fill="none" stroke="${O}" stroke-width="1.6"/>
      ${blush(44, 45, 16)}`;
    },

    /* 몽달귀신 */
    mongdal(t){
      return `
      <path d="M26 46 Q26 20 50 18 Q74 20 74 46 L74 70 Q70 80 64 72 Q60 84 54 74 Q50 86 44 74 Q38 84 34 72 Q28 80 26 70 Z" fill="#eef4ff" ${sw}/>
      <path d="M30 62 Q50 70 70 62" fill="none" stroke="${t.main}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M36 20 Q30 34 32 52 M64 20 Q70 34 68 52" fill="none" stroke="#3b3550" stroke-width="5" stroke-linecap="round"/>
      <path d="M34 24 Q50 12 66 24 Q58 20 50 22 Q42 20 34 24 Z" fill="#3b3550" ${sw2}/>
      <path d="M38 40 Q42 37 46 40 M54 40 Q58 37 62 40" fill="none" ${sw2}/>
      <ellipse cx="42" cy="44" rx="2.4" ry="3" fill="${O}"/><ellipse cx="58" cy="44" rx="2.4" ry="3" fill="${O}"/>
      <path d="M46 54 Q50 51 54 54" fill="none" ${sw2}/>
      <path d="M62 49 q2 4 0 6 q-2 -2 0 -6 Z" fill="#7fd0ff"/>
      ${blush(50, 50, 13)}
      <circle cx="18" cy="30" r="3" fill="#bfe6ff" opacity=".9"/><circle cx="84" cy="40" r="2.4" fill="#bfe6ff" opacity=".9"/>`;
    },

    /* 까마귀 */
    crow(t){
      return `
      <path d="M30 86 L34 80 M70 86 L66 80" ${sw}/>
      <ellipse cx="50" cy="58" rx="26" ry="25" fill="#2f3247" ${sw}/>
      <path d="M26 56 Q12 60 14 74 Q24 70 30 72 Z" fill="#23263a" ${sw}/>
      <path d="M74 56 Q88 60 86 74 Q76 70 70 72 Z" fill="#23263a" ${sw}/>
      <path d="M36 70 Q50 78 64 70 L60 78 Q50 82 40 78 Z" fill="${t.main}" ${sw2}/>
      <circle cx="50" cy="34" r="20" fill="#2f3247" ${sw}/>
      <path d="M44 15 Q48 6 52 14 Q56 6 58 16" fill="#2f3247" ${sw2}/>
      <circle cx="42" cy="32" r="6" fill="#fff"/><circle cx="58" cy="32" r="6" fill="#fff"/>
      <circle cx="43" cy="33" r="3.2" fill="${O}"/><circle cx="57" cy="33" r="3.2" fill="${O}"/>
      <circle cx="44" cy="31.6" r="1.1" fill="#fff"/><circle cx="58" cy="31.6" r="1.1" fill="#fff"/>
      <path d="M43 42 L50 52 L57 42 Q50 38 43 42 Z" fill="#f5b52e" ${sw2}/>
      ${blush(50, 41, 15)}`;
    },

    /* 까치 */
    magpie(t){
      return `
      <path d="M68 66 L92 50 L94 58 L72 74 Z" fill="#26304a" ${sw}/>
      <path d="M86 52 L92 50 L94 58 L89 61 Z" fill="#4f7bd6"/>
      <path d="M38 86 L40 80 M58 86 L56 80" ${sw}/>
      <ellipse cx="50" cy="60" rx="24" ry="22" fill="#fdfdfd" ${sw}/>
      <path d="M26 58 Q26 38 50 38 Q74 38 74 58 Q62 50 50 52 Q38 50 26 58 Z" fill="#26304a" ${sw}/>
      <path d="M68 52 Q84 58 80 74 Q72 70 66 70 Z" fill="#26304a" ${sw}/>
      <path d="M72 58 Q78 62 78 70" fill="none" stroke="#4f7bd6" stroke-width="3" stroke-linecap="round"/>
      <path d="M36 72 Q50 80 62 72" fill="none" stroke="${t.main}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="46" cy="32" r="19" fill="#26304a" ${sw}/>
      <path d="M40 14 Q44 6 48 13" fill="#26304a" ${sw2}/>
      <circle cx="40" cy="31" r="5.6" fill="#fff"/><circle cx="54" cy="31" r="5.6" fill="#fff"/>
      <circle cx="41" cy="32" r="3" fill="${O}"/><circle cx="53" cy="32" r="3" fill="${O}"/>
      <circle cx="42" cy="30.6" r="1" fill="#fff"/><circle cx="54" cy="30.6" r="1" fill="#fff"/>
      <path d="M44 39 L36 44 L46 44 Z" fill="#3a3a3a" ${sw2}/>
      ${blush(47, 40, 13)}`;
    },

    /* 울산바위 */
    rock(t){
      return `
      <path d="M14 86 L18 52 L26 30 L34 40 L42 16 L52 34 L60 20 L70 38 L78 30 L86 56 L88 86 Z" fill="#b8b4ad" ${sw}/>
      <path d="M26 30 L30 46 M42 16 L44 34 M60 20 L58 36 M78 30 L74 46" fill="none" stroke="#8f8a82" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M20 74 Q30 70 34 78 M66 78 Q74 70 82 76" fill="none" stroke="#8f8a82" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M54 12 L54 4 M50 10 L54 2 L58 10 M48 14 L54 6 L60 14 Z" fill="#3f9b5a" stroke="#2f6b3e" stroke-width="2" stroke-linejoin="round"/>
      <path d="M16 62 Q50 72 86 62" fill="none" stroke="${t.main}" stroke-width="5" stroke-linecap="round"/>
      <path d="M40 64 l-2 8 M50 66 l0 9 M60 64 l2 8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
      ${eyes(50, 48, 11, 3.6)}
      <path d="M38 44 l6 -2 M62 44 l-6 -2" ${sw2}/>
      ${smile(50, 55, 5)}
      ${blush(50, 54, 18)}`;
    },

    /* 뿔이 — 꼬마 도깨비 소년 */
    ppuri(t){
      return `
      ${hanbok(t, 30, 70, 64)}
      <path d="M74 84 L66 60" stroke="#8a5a2b" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="65" cy="56" rx="6" ry="9" transform="rotate(-18 65 56)" fill="#a8743f" ${sw2}/>
      <circle cx="50" cy="42" r="22" fill="#8fd0f0" ${sw}/>
      <path d="M45 22 L50 8 L55 22 Z" fill="#fff1b8" ${sw}/>
      <path d="M30 34 Q30 20 42 22 Q42 28 48 26 Q54 20 60 24 Q60 28 66 28 Q72 30 70 38 Q66 30 58 32 Q50 28 44 32 Q36 30 30 38 Z" fill="#3b2a55" ${sw2}/>
      ${eyes(50, 43, 8, 3.4)}
      <path d="M44 51 Q50 57 56 51 Z" fill="#fff" ${sw2}/>
      <path d="M47 51 l1.5 3 l1.5 -3" fill="none" stroke="${O}" stroke-width="1.4"/>
      ${blush(50, 50, 13)}`;
    },

    /* 방울이 — 꼬마 도깨비 소녀 */
    bangul(t){
      return `
      ${hanbok(t, 28, 72, 64)}
      <path d="M28 86 Q30 76 50 76 Q70 76 72 86 Z" fill="${t.dark}" ${sw2}/>
      <circle cx="50" cy="42" r="22" fill="#c9b6f2" ${sw}/>
      <path d="M36 24 L36 12 L44 21 Z M64 24 L64 12 L56 21 Z" fill="#fff1b8" ${sw2}/>
      <path d="M28 44 Q24 24 40 20 Q50 16 60 20 Q76 24 72 44 Q68 30 58 30 Q50 26 42 30 Q32 30 28 44 Z" fill="#3b2a55" ${sw2}/>
      <circle cx="50" cy="14" r="7" fill="#3b2a55" ${sw2}/>
      <circle cx="58" cy="10" r="4.4" fill="#f5c542" ${sw2}/><path d="M56.6 11 l2.8 0" stroke="${O}" stroke-width="1.4"/>
      <path d="M44 15 L56 15" stroke="${t.main}" stroke-width="3" stroke-linecap="round"/>
      ${eyes(50, 43, 8, 3.4)}
      <path d="M43 38 l-3 -2 M57 38 l3 -2" ${sw2}/>
      ${smile(50, 50, 4)}
      ${blush(50, 49, 13)}`;
    },

    /* 산신령 */
    sansin(t){
      return `
      <path d="M22 86 Q20 62 50 60 Q80 62 78 86 Z" fill="#f3efe6" ${sw}/>
      <path d="M30 72 Q50 78 70 72" fill="none" stroke="${t.main}" stroke-width="5" stroke-linecap="round"/>
      <path d="M84 86 L80 22" stroke="#8a5a2b" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M80 22 q-8 -6 -4 -14 q8 2 8 10 Z" fill="#8a5a2b" ${sw2}/>
      <circle cx="44" cy="38" r="20" fill="#ffd9b8" ${sw}/>
      <path d="M26 34 Q24 16 44 14 Q64 16 62 34 Q58 24 44 24 Q30 24 26 34 Z" fill="#f7f7f7" ${sw2}/>
      <ellipse cx="44" cy="12" rx="6" ry="5" fill="#f7f7f7" ${sw2}/>
      <path d="M41 9 L49 15" stroke="${t.main}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M30 34 Q36 30 40 34 M48 34 Q52 30 58 34" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
      <path d="M30 34 Q36 30 40 34 M48 34 Q52 30 58 34" fill="none" stroke="${O}" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M36 39 q2.5 2 5 0 M47 39 q2.5 2 5 0" fill="none" ${sw2}/>
      <path d="M28 46 Q30 72 44 80 Q58 72 60 46 Q52 52 44 50 Q36 52 28 46 Z" fill="#fbfbfb" ${sw}/>
      <path d="M38 48 Q44 52 50 48" fill="none" stroke="#e8e2d8" stroke-width="2"/>
      <path d="M40 46 Q44 49 48 46" fill="none" ${sw2}/>
      ${blush(44, 44, 13)}`;
    },

    /* 신선 */
    sinseon(t){
      return `
      <path d="M12 82 Q16 74 26 78 Q30 70 40 76 Q46 70 54 76 Q62 70 70 78 Q80 74 88 82 Q84 88 50 88 Q16 88 12 82 Z" fill="#ffffff" ${sw2}/>
      <path d="M26 80 Q24 60 50 58 Q76 60 74 80 Z" fill="${t.main}" ${sw}/>
      <path d="M50 59 L42 70 M50 59 L58 70" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M14 60 L26 46 L30 66 Z" fill="#f2f2f2" ${sw2}/>
      <path d="M17 58 L27 49 M19 62 L28 53" stroke="#c9c9c9" stroke-width="1.6"/>
      <path d="M26 64 L32 70" stroke="#8a5a2b" stroke-width="3.4" stroke-linecap="round"/>
      <circle cx="50" cy="38" r="20" fill="#ffd9b8" ${sw}/>
      <path d="M30 34 Q30 18 50 18 Q70 18 70 34 Q62 26 50 26 Q38 26 30 34 Z" fill="#2f2a3a" ${sw2}/>
      <ellipse cx="50" cy="14" rx="7" ry="6" fill="#2f2a3a" ${sw2}/>
      <path d="M40 10 L60 18" stroke="#e6c35c" stroke-width="2.6" stroke-linecap="round"/>
      ${eyes(50, 38, 7.5, 3)}
      <path d="M44 47 Q38 52 34 60 M56 47 Q62 52 66 60" fill="none" stroke="#2f2a3a" stroke-width="2.2" stroke-linecap="round"/>
      ${smile(50, 46, 3.5)}
      <path d="M50 52 L50 62" stroke="#2f2a3a" stroke-width="2.2" stroke-linecap="round"/>
      ${blush(50, 44, 13)}`;
    },
  };

  window.KCHARS = [
    {id:'sansin',   n:'산신령',     d:'흰 수염 할아버지 산신령', draw:DRAW.sansin},
    {id:'tiger',    n:'호랑이',     d:'산속의 왕 호랑이',        draw:DRAW.tiger},
    {id:'rock',     n:'울산바위',   d:'튼튼한 설악산 울산바위',   draw:DRAW.rock},
    {id:'mongdal',  n:'몽달귀신',   d:'둥실둥실 몽달귀신',        draw:DRAW.mongdal},
    {id:'magpie',   n:'까치',       d:'반가운 소식 까치',         draw:DRAW.magpie},
    {id:'ppuri',    n:'뿔이',       d:'꼬마 도깨비 소년',         draw:DRAW.ppuri},
    {id:'dokkaebi', n:'도깨비 대장', d:'방망이 든 도깨비 대장',    draw:DRAW.dokkaebi},
    {id:'sinseon',  n:'신선',       d:'구름 타는 신선',           draw:DRAW.sinseon},
    {id:'crow',     n:'까마귀',     d:'똑똑한 까마귀',            draw:DRAW.crow},
    {id:'bangul',   n:'방울이',     d:'방울 단 꼬마 도깨비 소녀',  draw:DRAW.bangul}
  ];
})();
