// ══════════════════════════════════════════════════════════════
// weather.js — 홈 대시보드 (날씨 + 브리핑 + 금융 요약)
// v=20260701a
// ══════════════════════════════════════════════════════════════

// ── HomeStage: 사용자 진행 단계 관리 (단방향, 절대 내려가지 않음) ──
var HomeStage = (function(){
  var KEY = 'moneynyang_setup_stage';
  return {
    get: function(){
      try{ return Math.max(0, parseInt(localStorage.getItem(KEY)||'0')||0); }catch(e){ return 0; }
    },
    advance: function(toStage){
      var cur = this.get();
      if(toStage > cur && toStage >= 1 && toStage <= 3){
        try{ localStorage.setItem(KEY, String(toStage)); }catch(e){}
      }
    }
  };
})();


// ── WeatherProvider: Open-Meteo + BigDataCloud 호출·캐시 ──
var WeatherProvider = (function(){
  var CACHE_KEY = 'moneynyang_weather_v1';
  var TTL = 30 * 60 * 1000; // 30분

  var WMO = {
    0:{i:'☀️',t:'맑음'}, 1:{i:'🌤️',t:'구름 조금'}, 2:{i:'🌥️',t:'흐림'}, 3:{i:'☁️',t:'매우 흐림'},
    45:{i:'🌫️',t:'안개'}, 48:{i:'🌫️',t:'안개'},
    51:{i:'🌦️',t:'이슬비'}, 53:{i:'🌦️',t:'이슬비'}, 55:{i:'🌧️',t:'강한 이슬비'},
    61:{i:'🌧️',t:'비'}, 63:{i:'🌧️',t:'비'}, 65:{i:'🌧️',t:'폭우'},
    71:{i:'🌨️',t:'눈'}, 73:{i:'🌨️',t:'눈'}, 75:{i:'❄️',t:'폭설'},
    80:{i:'⛈️',t:'소나기'}, 81:{i:'⛈️',t:'소나기'}, 82:{i:'⛈️',t:'강한 소나기'},
    95:{i:'⛈️',t:'뇌우'}, 96:{i:'⛈️',t:'뇌우+우박'}, 99:{i:'⛈️',t:'강한 뇌우'}
  };

  function _pm(pm25){
    if(pm25===null||pm25===undefined) return null;
    if(pm25<15) return {text:'좋음',   color:'var(--green)' };
    if(pm25<35) return {text:'보통',   color:'var(--yellow)'};
    if(pm25<75) return {text:'나쁨',   color:'var(--red)'   };
                return {text:'매우나쁨',color:'#c0392b'     };
  }

  function _load(){
    try{
      var raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return null;
      var d = JSON.parse(raw);
      if(Date.now()-d.ts > TTL) return null;
      return d;
    }catch(e){ return null; }
  }

  function _save(data){
    try{ localStorage.setItem(CACHE_KEY, JSON.stringify(data)); }catch(e){}
  }

  return {
    getCache: _load,
    fetch: function(onOk, onErr){
      var c = _load();
      if(c){ if(onOk) onOk(c); return; }
      if(!navigator.geolocation){ if(onErr) onErr('NO_GEO'); return; }
      navigator.geolocation.getCurrentPosition(
        function(pos){
          var lat = parseFloat(pos.coords.latitude.toFixed(4));
          var lon = parseFloat(pos.coords.longitude.toFixed(4));
          var wUrl = 'https://api.open-meteo.com/v1/forecast'
            +'?latitude='+lat+'&longitude='+lon
            +'&current=temperature_2m,apparent_temperature,weather_code,precipitation_probability'
            +'&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'
            +'&timezone=Asia%2FSeoul&forecast_days=1';
          var aqUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality'
            +'?latitude='+lat+'&longitude='+lon+'&current=pm2_5&timezone=Asia%2FSeoul';
          var geoUrl = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
            +'?latitude='+lat+'&longitude='+lon+'&localityLanguage=ko';
          Promise.all([
            fetch(wUrl).then(function(r){ return r.ok?r.json():Promise.reject('w'); }),
            fetch(aqUrl).then(function(r){ return r.ok?r.json():null; }).catch(function(){return null;}),
            fetch(geoUrl).then(function(r){ return r.ok?r.json():null; }).catch(function(){return null;})
          ]).then(function(res){
            var w=res[0], aq=res[1], geo=res[2];
            var wm = WMO[w.current.weather_code]||{i:'🌡️',t:'날씨 정보'};
            var pm25 = (aq&&aq.current&&aq.current.pm2_5!==undefined)?Math.round(aq.current.pm2_5):null;
            var loc = geo?(geo.locality||geo.city||geo.principalSubdivision||''):'';
            var data = {
              icon:wm.i, text:wm.t,
              temp:Math.round(w.current.temperature_2m),
              feelsLike:Math.round(w.current.apparent_temperature),
              maxTemp:Math.round(w.daily.temperature_2m_max[0]),
              minTemp:Math.round(w.daily.temperature_2m_min[0]),
              rainPct:Math.round(w.current.precipitation_probability||w.daily.precipitation_probability_max[0]||0),
              pm25:pm25, pmLevel:_pm(pm25), location:loc, ts:Date.now()
            };
            _save(data);
            if(onOk) onOk(data);
          }).catch(function(e){ if(onErr) onErr(e); });
        },
        function(e){ if(onErr) onErr(e); },
        {timeout:10000, maximumAge:300000}
      );
    }
  };
})();


// ── WeatherBuilder: 원시 데이터 → 분석용 정규화 JSON ──
var WeatherBuilder = {
  build: function(raw){
    if(!raw) return null;
    return {
      icon:raw.icon, text:raw.text, temp:raw.temp,
      feelsLike:raw.feelsLike, maxTemp:raw.maxTemp, minTemp:raw.minTemp,
      rainPct:raw.rainPct, pm25:raw.pm25, pmLevel:raw.pmLevel, location:raw.location,
      isHot:   raw.temp>=30,
      isCold:  raw.temp<10,
      isRainy: raw.rainPct>=60,
      isBadPm: !!(raw.pmLevel&&(raw.pmLevel.text==='나쁨'||raw.pmLevel.text==='매우나쁨')),
      ts:raw.ts
    };
  }
};


// ── WeatherFormatter: JSON → HTML 카드 문자열 ──
var WeatherFormatter = {
  loading: function(){
    return '<div class="home-wx-state">📍 날씨 정보를 불러오는 중...</div>';
  },
  unavail: function(){
    return '<div class="home-wx-state">📍 위치 권한을 허용하면 날씨를 볼 수 있어요</div>';
  },
  compact: function(d){
    if(!d) return WeatherFormatter.unavail();
    var pm = d.pmLevel
      ? '<span class="hwx-chip hwx-pm" style="color:'+d.pmLevel.color+'">미세먼지 '+d.pmLevel.text+'</span>'
      : '';
    return '<div class="home-wx-compact">'
      +'<span class="hwx-ci">'+d.icon+'</span>'
      +'<div class="hwx-meta">'
      +'<span class="hwx-ct">'+d.temp+'° <span class="hwx-cd">'+d.text+'</span></span>'
      +(d.location?'<span class="hwx-loc">📍 '+d.location+'</span>':'')
      +'</div>'
      +'<div class="hwx-side">'
      +'<span class="hwx-chip">강수 '+d.rainPct+'%</span>'
      +pm
      +'</div>'
      +'</div>';
  },
  full: function(d){
    if(!d) return WeatherFormatter.unavail();
    var pm = d.pmLevel
      ? '<div class="hwx-chip">미세먼지 <b style="color:'+d.pmLevel.color+'">'+d.pmLevel.text+'</b></div>'
      : '';
    return '<div class="home-wx-full">'
      +'<div class="hwx-row">'
      +'<div><div class="hwx-bi">'+d.icon+'</div>'
      +(d.location?'<div class="hwx-loc">📍 '+d.location+'</div>':'')+'</div>'
      +'<div class="hwx-rhs"><div class="hwx-bt">'+d.temp+'<span class="hwx-bu">°</span></div>'
      +'<div class="hwx-bd">'+d.text+'</div></div>'
      +'</div>'
      +'<div class="hwx-chips">'
      +'<div class="hwx-chip">체감 <b>'+d.feelsLike+'°</b></div>'
      +'<div class="hwx-chip">최고 <b>'+d.maxTemp+'°</b> / 최저 <b>'+d.minTemp+'°</b></div>'
      +'<div class="hwx-chip">강수 <b>'+d.rainPct+'%</b></div>'
      +pm
      +'</div>'
      +'</div>';
  }
};


// ── HomeDashboardBuilder: 금융·브리핑·목표 데이터 생성 ──
var HomeDashboardBuilder = {

  financial: function(){
    try{
      var today=new Date(), y=today.getFullYear(), m=today.getMonth();
      var income = typeof getIncomeSummary==='function' ? getIncomeSummary(y,m) : {total:0};
      var incTotal = income.total||0;
      var bs = typeof budgetState!=='undefined' ? budgetState : null;
      if(bs&&!bs._loaded&&typeof budgetLoad==='function') budgetLoad();
      var fixed = bs ? Object.values(bs.fixedExpenses||{}).reduce(function(s,v){return s+(parseInt(v)||0);},0) : 0;
      var ym = y+'-'+String(m+1).padStart(2,'0');
      var varItems = bs ? (bs.variableExpenses||[]).filter(function(e){return e.date&&e.date.startsWith(ym);}) : [];
      var varExp = varItems.reduce(function(s,e){return s+(parseInt(e.amount)||0);},0);
      var totalExp = fixed+varExp;
      var remain = incTotal-totalExp;
      var spendPct = incTotal>0 ? Math.round(totalExp/incTotal*100) : 0;
      var daysInMonth = new Date(y,m+1,0).getDate();
      var daysLeft = daysInMonth-today.getDate();
      var dailyBudget = daysLeft>0 ? Math.round(remain/daysLeft) : remain;
      var pay = typeof getPayData==='function' ? getPayData() : null;
      var finalPay = pay?(pay.finalPay||0):0;
      var paydayDiff = null;
      try{
        var pd = parseInt(localStorage.getItem('atm2_payday')||'0')||0;
        if(pd>0){
          var pdate = new Date(y,m,pd);
          if(pdate<=today) pdate = new Date(y,m+1,pd);
          paydayDiff = Math.ceil((pdate-today)/(86400000));
        }
      }catch(e2){}
      return {
        incTotal:incTotal, fixed:fixed, varExp:varExp, totalExp:totalExp,
        remain:remain, spendPct:spendPct, daysLeft:daysLeft, dailyBudget:dailyBudget,
        finalPay:finalPay, paydayDiff:paydayDiff,
        isExceeded:remain<0,
        hasData:incTotal>0||fixed>0||varExp>0||finalPay>0
      };
    }catch(e){
      return {incTotal:0,remain:0,spendPct:0,daysLeft:0,dailyBudget:0,finalPay:0,
              isExceeded:false,hasData:false,paydayDiff:null};
    }
  },

  // 브리핑: 경고 → 희망 → 행동 순서, 날씨와 금융을 연결
  briefing: function(w, fin, stage){
    var L = [];
    if(stage<3){
      if(stage===0){ L.push('👋 머니냥에 오신 걸 환영해요!'); L.push('직업을 선택하면 AI 분석이 시작돼요 🐱'); }
      else if(stage===1){ L.push('✅ 직업 선택 완료! 첫 걸음을 내딛었어요 💪'); L.push('급여 정보를 입력하면 오늘 예산을 계산해드려요.'); }
      else { L.push('🎉 수입 등록 완료! 정말 잘 하고 있어요!'); L.push('예산을 설정하면 생존 분석이 시작돼요 🛡️'); }
      return L.join('\n');
    }
    // Stage 3: 날씨 + 금융 연결 브리핑
    if(w){
      if(w.isRainy){
        L.push('🌧️ 오늘은 비가 와요. 우산을 챙기세요!');
        try{
          var jobs = JSON.parse(localStorage.getItem('atm2_selectedJobs')||'[]');
          if(jobs.some(function(j){return j==='delivery'||j==='personal_alba'||j==='company_alba';}))
            L.push('비 오는 날 배달 수요가 높아 수입이 늘 수 있어요 📦');
        }catch(e){}
      } else if(w.isHot){
        L.push('🌡️ 오늘은 '+w.temp+'℃, 더운 날이에요.');
        if(fin&&fin.remain<100000&&fin.remain>=0) L.push('냉방비·음료 지출이 늘 수 있으니 예산에 주의해요.');
      } else if(w.isCold){
        L.push('🧥 오늘은 '+w.temp+'℃, 쌀쌀해요. 따뜻하게 입으세요!');
      } else {
        L.push(w.icon+' 오늘 날씨는 '+w.text+'이에요.');
      }
      if(w.isBadPm) L.push('😷 미세먼지 '+w.pmLevel.text+' — 외출 시 마스크를 챙기세요.');
    }
    if(fin){
      if(!fin.hasData){
        L.push('💡 급여 정보를 입력하면 AI 분석이 더 정확해져요!');
      } else if(fin.isExceeded){
        L.push('⚠️ 이번달 예산을 초과했어요.');
        if(fin.daysLeft>0){
          var recovery = Math.round(Math.abs(fin.remain)/fin.daysLeft);
          L.push('남은 '+fin.daysLeft+'일 동안 하루 '+_hN(recovery)+'씩 절약하면 회복 가능해요 💪');
        }
      } else if(fin.remain<50000&&fin.incTotal>0){
        L.push('💛 남은 예산 '+_hN(fin.remain)+', 조금만 더 아끼면 목표 달성이에요!');
      } else if(fin.incTotal>0){
        L.push('✅ 예산을 잘 지키고 있어요! 이 속도면 충분해요.');
      }
      if(fin.paydayDiff!==null&&fin.paydayDiff>=0&&fin.paydayDiff<=3)
        L.push('🎉 급여일 D-'+fin.paydayDiff+'! 이번달 정말 수고했어요.');
    }
    return L.join('\n');
  },

  // 목표: AI 브리핑과 연결된 오늘의 1줄 행동 제시
  goal: function(w, fin, stage){
    if(stage===0) return '직업을 선택하면 AI가 분석을 시작해요!';
    if(stage===1) return '💰 급여 정보를 입력해보세요 — 오늘 쓸 수 있는 예산이 계산돼요.';
    if(stage===2) return '🛡️ 예산을 설정하면 생존 분석이 시작돼요!';
    if(!fin||!fin.hasData) return '💡 급여 정보를 입력하면 오늘 목표가 계산돼요.';
    if(fin.isExceeded) return '⚠️ 오늘은 추가 지출을 멈춰보세요. 절약이 곧 회복이에요.';
    if(fin.dailyBudget>0) return '🛡️ 오늘은 '+_hN(fin.dailyBudget)+' 안에서 지출해보세요!';
    if(fin.remain>0) return '✅ 이번달 마무리 잘 해봐요! 남은 예산 '+_hN(fin.remain);
    return '💡 오늘 하루도 계획적인 소비를 해봐요!';
  },

  actions: function(){
    var dflt = ['ask:report','ask:budgetDetail','ask:savingTip'];
    try{
      if(typeof AsstInsightEngine==='undefined') return dflt;
      var ins = AsstInsightEngine.analyze();
      if(!ins||!ins.length) return dflt;
      var out = [];
      ins.slice(0,3).forEach(function(i){ if(i.actions) out = out.concat(i.actions.slice(0,2)); });
      return out.length>=2 ? out.slice(0,3) : dflt;
    }catch(e){ return dflt; }
  }
};

function _hN(n){ return Math.abs(Math.round(n||0)).toLocaleString('ko-KR')+'원'; }


// ══════════════════════════════════════════
// renderHomePage: 홈 화면 전체 렌더링
// ══════════════════════════════════════════
function renderHomePage(){
  var page = document.getElementById('home-page');
  if(!page) return;

  // 기존 사용자 데이터 기반 Stage 자동 승급 (backwards compat)
  _homeAutoStage();

  var stage   = HomeStage.get();
  var fin     = HomeDashboardBuilder.financial();
  var wRaw    = WeatherProvider.getCache();
  var w       = WeatherBuilder.build(wRaw);
  var briefing= HomeDashboardBuilder.briefing(w, fin, stage);
  var goal    = HomeDashboardBuilder.goal(w, fin, stage);

  var H = '<div class="home-content">';

  if(stage<3){
    // ════ Empty / 과도기 상태 ════
    H += '<div id="home-wx-wrap" class="home-wx-wrap home-card">'
      +(wRaw ? WeatherFormatter.compact(w) : WeatherFormatter.loading())+'</div>';
    H += _hWelcome(stage);
    H += _hChecklist(stage);
    H += _hAiGuide();
    H += '<div class="home-card"><div class="home-lbl">🐱 AI 브리핑</div>'
      +'<div id="home-briefing" class="home-briefing-txt">'+briefing.replace(/\n/g,'<br>')+'</div>'
      +'</div>';
    H += _hGoal(goal, stage);

  } else {
    // ════ Stage 3 Dashboard ════
    H += '<div id="home-wx-wrap" class="home-wx-wrap home-card">'
      +(wRaw ? WeatherFormatter.full(w) : WeatherFormatter.loading())+'</div>';
    H += '<div class="home-card"><div class="home-lbl">🐱 AI 브리핑</div>'
      +'<div id="home-briefing" class="home-briefing-txt">'+briefing.replace(/\n/g,'<br>')+'</div>'
      +'</div>';
    H += _hGoal(goal, stage);
    if(fin.hasData) H += _hFinancial(fin);
    H += _hQuick();
    H += _hActions();
  }

  H += '</div>';
  page.innerHTML = H;

  // 날씨 비동기 로드 (캐시 미스 시에만)
  if(!wRaw){
    WeatherProvider.fetch(function(raw){
      var wd = WeatherBuilder.build(raw);
      var wxEl = document.getElementById('home-wx-wrap');
      if(wxEl) wxEl.innerHTML = stage<3 ? WeatherFormatter.compact(wd) : WeatherFormatter.full(wd);
      // 브리핑·목표 업데이트
      var nb = HomeDashboardBuilder.briefing(wd, fin, stage);
      var ng = HomeDashboardBuilder.goal(wd, fin, stage);
      var be = document.getElementById('home-briefing');
      if(be) be.innerHTML = nb.replace(/\n/g,'<br>');
      var ge = document.getElementById('home-goal-txt');
      if(ge) ge.textContent = ng;
    }, function(){
      var wxEl = document.getElementById('home-wx-wrap');
      if(wxEl) wxEl.innerHTML = WeatherFormatter.unavail();
    });
  }
}

// 기존 데이터를 가진 사용자 자동 Stage 승급 (첫 실행 시 1회)
function _homeAutoStage(){
  var st = HomeStage.get();
  if(st<1){
    try{
      var j = JSON.parse(localStorage.getItem('atm2_selectedJobs')||'[]');
      if(j.length>0) HomeStage.advance(1);
    }catch(e){}
  }
  if(HomeStage.get()<2){
    try{
      var inc = typeof getIncomeSummary==='function'
        ? getIncomeSummary(new Date().getFullYear(), new Date().getMonth())
        : {total:0};
      if((inc.total||0)>0) HomeStage.advance(2);
    }catch(e){}
  }
  if(HomeStage.get()<3){
    try{
      var bs = typeof budgetState!=='undefined' ? budgetState : null;
      if(bs&&!bs._loaded&&typeof budgetLoad==='function') budgetLoad();
      if(bs){
        var fx = Object.values(bs.fixedExpenses||{}).reduce(function(s,v){return s+(parseInt(v)||0);},0);
        if(fx>0||(bs.customIncome||0)>0) HomeStage.advance(3);
      }
    }catch(e){}
  }
}


// ── 홈 내부 렌더 헬퍼 ──

function _hWelcome(stage){
  var msgs = {
    0:{t:'머니냥에 오신 걸 환영해요! 🐱', s:'급여·예산·근태를 AI가 자동 분석해<br>오늘 하루 얼마를 쓸 수 있는지 알려드려요.'},
    1:{t:'직업 선택 완료! 첫 걸음 완료 💪', s:'이제 급여 정보를 입력하면<br>AI 분석이 바로 시작돼요.'},
    2:{t:'수입 등록 완료! 🎉', s:'예산을 설정하면 오늘 가용 예산과<br>생존 분석이 완성돼요!'}
  }[stage]||{t:'머니냥',s:''};
  return '<div class="home-card home-welcome">'
    +'<div class="home-welcome-cat">🐱</div>'
    +'<div class="home-welcome-title">'+msgs.t+'</div>'
    +'<div class="home-welcome-sub">'+msgs.s+'</div>'
    +'</div>';
}

function _hChecklist(stage){
  var steps = [
    {label:'직업 선택',      desc:'직장인 · 알바 · 프리랜서', nav:'settings', btn:'선택하기'},
    {label:'급여 정보 입력',  desc:'기본급 · 예상 실수령액',    nav:'sal',      btn:'입력하기'},
    {label:'예산 만들기',    desc:'고정비 · 생활비 설정',      nav:'budget',   btn:'설정하기'}
  ];
  var H = '<div class="home-card"><div class="home-lbl">🚀 시작하기</div><div class="home-steps">';
  steps.forEach(function(s,i){
    var n=i+1, done=n<=stage, active=n===stage+1, locked=n>stage+1;
    H += '<div class="home-step'+(done?' home-step-done':active?' home-step-active':locked?' home-step-locked':'')+'"">'
      +'<div class="home-step-num'+(done?' hstep-done':active?' hstep-active':'')+'">'+( done?'✓':n )+'</div>'
      +'<div class="home-step-info">'
      +'<div class="home-step-t'+(active?' hstep-ta':'')+'">'+s.label+'</div>'
      +'<div class="home-step-d">'+s.desc+'</div>'
      +'</div>'
      +(done?'<span class="home-step-ok">완료 ✅</span>'
        :active?'<button class="home-step-btn" onclick="showPage(\''+s.nav+'\')">'+s.btn+'</button>'
        :'<span class="home-step-lk">🔒</span>')
      +'</div>';
  });
  return H+'</div></div>';
}

function _hAiGuide(){
  var tags=['💰 급여 자동 계산','🛡️ 예산 초과 경고','📋 OT·출근 분석','✨ 절약 팁','📊 월말 리포트'];
  return '<div class="home-card"><div class="home-lbl">🤖 AI가 도와드리는 것</div>'
    +'<div class="home-ai-tags">'
    +tags.map(function(t){return '<span class="home-ai-tag">'+t+'</span>';}).join('')
    +'</div></div>';
}

function _hGoal(goal, stage){
  var navMap = {1:'sal', 2:'budget'};
  var nav = navMap[stage]||null;
  return '<div class="home-card home-goal">'
    +'<div class="home-lbl home-goal-lbl">🔥 오늘의 목표</div>'
    +'<div id="home-goal-txt" class="home-goal-txt">'+goal+'</div>'
    +(nav?'<button class="home-goal-btn" onclick="showPage(\''+nav+'\')">바로 가기 →</button>':'')
    +'</div>';
}

function _hFinancial(fin){
  function cell(lbl, val, cls){
    return '<div class="hfin-cell"><div class="hfin-lbl">'+lbl+'</div>'
      +'<div class="hfin-val '+cls+'">'+val+'</div></div>';
  }
  var dayVal = fin.isExceeded?'초과':fin.dailyBudget>0?_hN(fin.dailyBudget):'계산 중';
  var dayCls = fin.isExceeded?'hfin-r':fin.dailyBudget<10000?'hfin-y':'hfin-g';
  return '<div class="home-card"><div class="home-lbl">💰 이번달 금융 요약</div>'
    +'<div class="hfin-grid">'
    +cell('오늘 사용 가능', dayVal, dayCls)
    +cell('이번달 잔여', fin.isExceeded?('-'+_hN(Math.abs(fin.remain))):_hN(fin.remain), fin.isExceeded?'hfin-r':fin.remain<50000?'hfin-y':'hfin-b')
    +cell('예상 실수령액', fin.finalPay>0?_hN(fin.finalPay):'—', 'hfin-w')
    +cell('이번달 지출률', fin.spendPct+'%', fin.spendPct>=90?'hfin-r':fin.spendPct>=70?'hfin-y':'hfin-g')
    +'</div></div>';
}

function _hQuick(){
  var btns = [
    {i:'📋', l:'출근하기', o:"typeof manualRecordAttendance==='function'?manualRecordAttendance():showPage('att')"},
    {i:'💰', l:'급여 보기', o:"showPage('sal')"},
    {i:'🛡️', l:'생존관리',  o:"showPage('budget')"},
    {i:'🤖', l:'AI 상담',   o:"if(typeof toggleAsst==='function')toggleAsst()"}
  ];
  var H = '<div class="home-card"><div class="home-lbl">⚡ 빠른 실행</div><div class="home-quick-grid">';
  btns.forEach(function(b){
    H += '<div class="home-quick-btn" onclick="'+b.o+'">'
      +'<span class="home-qi">'+b.i+'</span><div class="home-ql">'+b.l+'</div></div>';
  });
  return H+'</div></div>';
}

var _HOME_ACT_LABELS = {
  'ask:report':'📊 이번달 리포트', 'ask:budgetDetail':'🛡️ 예산 상세',
  'ask:savingTip':'✨ 절약 팁',    'ask:otAnalysis':'📋 OT 분석',
  'ask:leaveCheck':'🌿 연차 확인', 'ask:nextGoal':'🎯 다음 목표',
  'ask:monthlyReport':'📋 월 리포트','ask:budgetCause':'🔍 지출 분석'
};

function _hActions(){
  var acts = HomeDashboardBuilder.actions();
  var H = '<div class="home-card"><div class="home-lbl">✨ 오늘의 추천</div><div class="home-act-chips">';
  acts.forEach(function(ak){
    var lbl = _HOME_ACT_LABELS[ak]||ak;
    H += '<button class="home-act-chip" '
      +'onclick="if(typeof AsstActionDispatcher!==\'undefined\')AsstActionDispatcher.handle(\''+ak+'\');'
      +'if(typeof toggleAsst===\'function\'&&!asstOpen)toggleAsst();">'+lbl+'</button>';
  });
  return H+'</div></div>';
}


// ── 앱 로드 완료 후 홈 페이지 진입 ──
window.addEventListener('load', function(){
  if(typeof showPage==='function') showPage('home');
});
