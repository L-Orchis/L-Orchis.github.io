/* ============================================================
   咖啡店选址区位教学应用 · 交互逻辑
   数据来自 data.js (window.COFFEE_DATA)
   ============================================================ */
(function(){
  'use strict';
  var D = window.COFFEE_DATA;
  if(!D){ console.error('数据未加载'); return; }

  // 随机把 arabica/luckin 分配给 A/B
  var brandMap = Math.random() < 0.5
    ? { A:'arabica', B:'luckin' }
    : { A:'luckin', B:'arabica' };
  var BRAND_INFO = {
    arabica:{ name:'% Arabica', badge:'%', color:'#0C3F31', total:D.meta.arabica_total },
    luckin :{ name:'瑞幸咖啡',  badge:'瑞', color:'#12327E', total:D.meta.luckin_total }
  };
  // slot 反查（品牌->A/B）与揭晓状态：提交答案前一律匿名
  var slotOf = {}; slotOf[brandMap.A]='A'; slotOf[brandMap.B]='B';
  var revealed = false;

  /* ---------- 1. 地理投影：经纬度 -> SVG 坐标 ---------- */
  var VB_W=760, VB_H=720, PAD=28;
  // 计算 bbox
  var minLng=999,maxLng=-999,minLat=999,maxLat=-999;
  D.geo.features.forEach(function(f){
    walkCoords(f.geometry, function(lng,lat){
      if(lng<minLng)minLng=lng; if(lng>maxLng)maxLng=lng;
      if(lat<minLat)minLat=lat; if(lat>maxLat)maxLat=lat;
    });
  });
  function walkCoords(geom, cb){
    var t=geom.type, c=geom.coordinates;
    var polys = t==='MultiPolygon'? c : [c];
    polys.forEach(function(poly){ poly.forEach(function(ring){ ring.forEach(function(pt){ cb(pt[0],pt[1]); }); }); });
  }
  // 上海纬度 ~31，用 cos 校正经度比例，保持形状
  var latRad = (minLat+maxLat)/2 * Math.PI/180;
  var lngScaleFix = Math.cos(latRad);
  var geoW = (maxLng-minLng)*lngScaleFix, geoH = (maxLat-minLat);
  var scale = Math.min((VB_W-2*PAD)/geoW, (VB_H-2*PAD)/geoH);
  var drawW = geoW*scale, drawH = geoH*scale;
  var offX = (VB_W-drawW)/2, offY = (VB_H-drawH)/2;
  function project(lng,lat){
    var x = offX + (lng-minLng)*lngScaleFix*scale;
    var y = offY + (maxLat-lat)*scale; // 纬度翻转
    return [x,y];
  }

  /* ---------- 2. 渲染行政区 ---------- */
  var gDist=document.getElementById('g-dist');
  var gLabels=document.getElementById('g-labels');
  var gStores=document.getElementById('g-stores');
  var gRipple=document.getElementById('g-ripple');

  D.geo.features.forEach(function(f){
    var isSub = f.properties.zone==='suburb';
    var pathStr = geoToPath(f.geometry);
    var p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',pathStr);
    if(isSub) p.setAttribute('class','suburb');
    p.setAttribute('data-name', f.properties.name);
    gDist.appendChild(p);
    // label at centroid
    var c=f.properties.center;
    if(c){
      var xy=project(c[0],c[1]);
      var t=document.createElementNS('http://www.w3.org/2000/svg','text');
      t.setAttribute('x',xy[0]); t.setAttribute('y',xy[1]);
      t.setAttribute('class','dist-label'+(isSub?' suburb':''));
      t.textContent=f.properties.name.replace('区','').replace('新','');
      gLabels.appendChild(t);
    }
  });
  function geoToPath(geom){
    var t=geom.type, c=geom.coordinates;
    var polys = t==='MultiPolygon'? c : [c];
    var d='';
    polys.forEach(function(poly){
      poly.forEach(function(ring){
        ring.forEach(function(pt,i){
          var xy=project(pt[0],pt[1]);
          d += (i===0?'M':'L') + xy[0].toFixed(1)+','+xy[1].toFixed(1);
        });
        d+='Z';
      });
    });
    return d;
  }

  /* ---------- 2.5 黄浦江：分割陆地（隔离层切开两岸区界 + 江体 + 江心） ---------- */
  (function buildRiver(){
    if(!D.river) return;
    var gRiver=document.getElementById('g-river');
    if(!gRiver) return;
    var band=D.river.huangpu_band;
    if(!band) return;
    var polys = (D.river.band_type==='MultiPolygon') ? band : [band];
    var dstr='';
    polys.forEach(function(poly){
      poly.forEach(function(ring){
        ring.forEach(function(pt,i){ var xy=project(pt[0],pt[1]); dstr+=(i===0?'M':'L')+xy[0].toFixed(1)+','+xy[1].toFixed(1); });
        dstr+='Z';
      });
    });
    var p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',dstr);
    gRiver.appendChild(p);
  })();

  /* ---------- 3. 门店点（预建，隐藏） ---------- */
  var placed = { A:false, B:false };
  var storeNodes = { arabica:[], luckin:[] };
  function buildStores(brandKey){
    var arr = D[brandKey];
    var color = BRAND_INFO[brandKey].color;
    var isArabica = brandKey==='arabica';
    var r = isArabica ? 5.5 : 3.4;
    arr.forEach(function(s){
      var xy=project(s.lng, s.lat);
      var circ=document.createElementNS('http://www.w3.org/2000/svg','circle');
      circ.setAttribute('cx',xy[0].toFixed(1));
      circ.setAttribute('cy',xy[1].toFixed(1));
      circ.setAttribute('r',r);
      circ.setAttribute('data-br',r);          // 基础半径，缩放时反向补偿
      circ.setAttribute('fill',color);
      circ.setAttribute('stroke','#fff');
      circ.setAttribute('stroke-width', isArabica?1.4:0.9);
      circ.setAttribute('fill-opacity', isArabica?1:0.82);
      circ.setAttribute('class','store-dot dot-'+brandKey);
      circ.setAttribute('data-dist', s.district||'');
      circ.style.filter = isArabica ? 'drop-shadow(0 1px 3px rgba(12,63,49,.5))':'';
      gStores.appendChild(circ);
      storeNodes[brandKey].push(circ);
      // tooltip：始终显示位置信息 —— 瑞幸显示行政区，% Arabica 显示具体商铺名；不显示品牌名以免答题前泄底
      (function(shopName, dist){
        circ.addEventListener('mouseenter', function(e){
          if(isArabica){ showTip(e, shopName, ''); }       // % Arabica：具体商铺名(IFC/外滩源/新天地…)
          else { showTip(e, dist||'上海', ''); }            // 瑞幸：所在行政区(黄浦区/徐汇区/长宁区…)
        });
      })(s.name||BRAND_INFO[brandKey].name, s.district);
      circ.addEventListener('mousemove', moveTip);
      circ.addEventListener('mouseleave', hideTip);
    });
  }
  buildStores('luckin'); buildStores('arabica'); // Arabica 后建 => SVG 中位于顶层，hover 命中正确的点



  /* ---------- 3.5 参考图层：地铁主干线 + 商圈CBD ---------- */
  (function buildReferenceLayers(){
    if(!D.ref) return;
    var svg=document.getElementById('map-svg');
    var gMetro=document.getElementById('g-metro');
    var gCbd=document.getElementById('g-cbd');
    var gTop=document.getElementById('g-toplabels');
    // 地铁线：每条一种颜色（官方线路色系）
    var metroColors={'1号线':'#E4002B','2号线':'#8CC63F','9号线':'#87CEEB','10号线':'#C6A4D6'};
    Object.keys(D.ref.metro).forEach(function(line){
      var pts=D.ref.metro[line];
      var d='';
      pts.forEach(function(pt,i){ var xy=project(pt[0],pt[1]); d+=(i===0?'M':'L')+xy[0].toFixed(1)+','+xy[1].toFixed(1); });
      var path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',d);
      path.setAttribute('stroke',metroColors[line]||'#888');
      gMetro.appendChild(path);
    });
    // 商圈/CBD：光环 + 核心点 + 标签
    D.ref.cbds.forEach(function(c){
      var xy=project(c.lng,c.lat);
      var g=document.createElementNS('http://www.w3.org/2000/svg','g');
      var ring=document.createElementNS('http://www.w3.org/2000/svg','circle');
      ring.setAttribute('cx',xy[0].toFixed(1));ring.setAttribute('cy',xy[1].toFixed(1));ring.setAttribute('r',6);
      ring.setAttribute('data-br',6);
      ring.setAttribute('class','cbd-ring');
      var core=document.createElementNS('http://www.w3.org/2000/svg','circle');
      core.setAttribute('cx',xy[0].toFixed(1));core.setAttribute('cy',xy[1].toFixed(1));core.setAttribute('r',2.6);
      core.setAttribute('data-br',2.6);
      core.setAttribute('class','cbd-core');
      var tx=document.createElementNS('http://www.w3.org/2000/svg','text');
      tx.setAttribute('x',xy[0].toFixed(1));tx.setAttribute('y',(xy[1]-9).toFixed(1));
      tx.setAttribute('data-cx',xy[0].toFixed(1));tx.setAttribute('data-cy',xy[1].toFixed(1));tx.setAttribute('data-off','9');
      tx.setAttribute('class','cbd-label');tx.textContent=c.name;
      g.appendChild(ring);g.appendChild(core);
      gCbd.appendChild(g);
      if(gTop) gTop.appendChild(tx); else g.appendChild(tx);
    });
    // 咖啡加工厂：工厂形标记 + 标签（工业区位，集中郊区）
    var gFactory=document.getElementById('g-factory');
    if(gFactory && D.factory){
      D.factory.forEach(function(fac){
        var xy=project(fac.lng,fac.lat), cx=xy[0], cy=xy[1];
        var g=document.createElementNS('http://www.w3.org/2000/svg','g');
        // 工厂标记：小房顶折线图形（相对锚点 cx,cy）
        var mk=document.createElementNS('http://www.w3.org/2000/svg','path');
        var d='M'+(cx-4)+','+(cy+3.2)+'V'+(cy-0.5)+'l3-2v2l3-2v2l3-2v5.2Z';
        mk.setAttribute('d',d); mk.setAttribute('class','fac-mk');
        mk.setAttribute('data-shape','factory'); mk.setAttribute('data-cx',cx.toFixed(2)); mk.setAttribute('data-cy',cy.toFixed(2));
        var tx=document.createElementNS('http://www.w3.org/2000/svg','text');
        tx.setAttribute('x',cx.toFixed(1)); tx.setAttribute('y',(cy-6).toFixed(1));
        tx.setAttribute('data-cx',cx.toFixed(1)); tx.setAttribute('data-cy',cy.toFixed(1)); tx.setAttribute('data-off','6');
        tx.setAttribute('class','fac-label'); tx.textContent=fac.name;
        g.appendChild(mk);
        gFactory.appendChild(g);
        if(gTop) gTop.appendChild(tx); else g.appendChild(tx);
      });
    }
    // 开关
    var refMetroOn=false, refCbdOn=false, refFactoryOn=false;
    var btnM=document.getElementById('refMetro'), btnC=document.getElementById('refCbd'), btnF=document.getElementById('refFactory');
    btnM.addEventListener('click',function(){
      refMetroOn=!refMetroOn;
      svg.classList.toggle('show-metro',refMetroOn);
      btnM.classList.toggle('on',refMetroOn);
    });
    btnC.addEventListener('click',function(){
      refCbdOn=!refCbdOn;
      svg.classList.toggle('show-cbd',refCbdOn);
      btnC.classList.toggle('on',refCbdOn);
    });
    if(btnF) btnF.addEventListener('click',function(){
      refFactoryOn=!refFactoryOn;
      svg.classList.toggle('show-factory',refFactoryOn);
      btnF.classList.toggle('on',refFactoryOn);
    });
  })();

  function revealBrand(slot){ // slot 'A'/'B'
    if(placed[slot]) return;
    var brandKey = brandMap[slot];
    placed[slot]=true;
    var nodes = storeNodes[brandKey];
    nodes.forEach(function(n,i){
      setTimeout(function(){
        n.classList.add('show');
        spawnRipple(n.getAttribute('cx'), n.getAttribute('cy'), BRAND_INFO[brandKey].color);
      }, i* (brandKey==='arabica'? 70 : 12));
    });
    // 更新 chip 状态（揭晓前不显示会泄底的门店数量）
    var chip=document.getElementById('chip'+slot);
    chip.classList.add('placed');
    chip.querySelector('.chip-count').innerHTML='门店分布已显示到地图上';
    // 激活对应图层开关（匿名）
    activateLayer(brandKey);
    checkBothPlaced();
  }
  function spawnRipple(cx,cy,color){
    var c=document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx',cx); c.setAttribute('cy',cy); c.setAttribute('r',0);
    c.setAttribute('class','ripple go'); c.setAttribute('stroke',color); c.setAttribute('stroke-width',2);
    gRipple.appendChild(c);
    setTimeout(function(){ c.remove(); },1200);
  }
  function checkBothPlaced(){
    if(placed.A && placed.B){
      document.getElementById('guessBox').classList.add('ready');
    }
  }

  /* ---------- 图层显示/隐藏切换 ---------- */
  // 记录每个品牌当前是否可见（默认可见）
  var layerVisible = { arabica:true, luckin:true };
  function activateLayer(brandKey){
    var slot = slotOf[brandKey];                       // A / B
    var el = document.getElementById('lyr'+slot);      // lyrA / lyrB
    el.classList.remove('disabled');
    // 图层小圆点用该品牌真实颜色（不泄底，只是配色）
    el.querySelector('.lyr-dot').style.background = BRAND_INFO[brandKey].color;
    // 揭晓前只显示匿名「品牌 A/B」，不显示真实名与数量
    el.querySelector('.lyr-txt b').textContent = '品牌 '+slot;
    el.querySelector('.lyr-txt span').textContent = '点击可单独查看';
  }
  // 揭晓后把图层开关换成真实品牌名 + 数量
  function relabelLayersAfterReveal(){
    ['arabica','luckin'].forEach(function(bk){
      var el = document.getElementById('lyr'+slotOf[bk]);
      if(el.classList.contains('disabled')) return;
      el.querySelector('.lyr-txt b').textContent = BRAND_INFO[bk].name;
      el.querySelector('.lyr-txt span').textContent = storeNodes[bk].length + (bk==='arabica'?' 家门店':' 个采样点');
    });
  }
  function applyLayer(brandKey){
    var cls = 'hide-'+brandKey;
    if(layerVisible[brandKey]) gStores.classList.remove(cls);
    else gStores.classList.add(cls);
  }
  var brandOfSlot = {}; brandOfSlot['A']=brandMap.A; brandOfSlot['B']=brandMap.B;
  ['lyrA','lyrB'].forEach(function(id){
    var el=document.getElementById(id);
    el.addEventListener('click', function(){
      if(el.classList.contains('disabled')) return;
      var brandKey = brandOfSlot[el.dataset.slot];     // 按 slot 反查真实品牌
      var other = brandKey==='arabica'?'luckin':'arabica';
      var onlyThis = layerVisible[brandKey] && !layerVisible[other]; // 当前已是「只看它」
      if(onlyThis){
        // 再点一次 => 恢复两个都显示
        layerVisible[brandKey]=true; layerVisible[other]=true;
      } else {
        // 「单独查看」：只显示点的这个，隐藏另一个
        layerVisible[brandKey]=true; layerVisible[other]=false;
      }
      syncLayerUI();
    });
  });
  function syncLayerUI(){
    ['arabica','luckin'].forEach(function(bk){
      var el=document.getElementById('lyr'+slotOf[bk]);
      el.classList.toggle('off', !layerVisible[bk]);
      applyLayer(bk);
    });
  }

  /* ---------- 4. 拖拽（鼠标 + 触摸统一 pointer） ---------- */
  var ghost=document.getElementById('ghost');
  var ghostTxt=document.getElementById('ghostTxt');
  var ghostBadge=ghost.querySelector('.gb');
  var mapBox=document.getElementById('mapBox');
  var dragging=null;

  ['chipA','chipB'].forEach(function(id){
    var chip=document.getElementById(id);
    chip.addEventListener('pointerdown', function(e){
      if(chip.classList.contains('placed')) return;
      e.preventDefault();
      dragging = chip.dataset.brand;
      chip.classList.add('dragging');
      var badge=chip.querySelector('.chip-badge');
      ghostBadge.textContent = badge.textContent;
      ghostBadge.style.background = getComputedStyle(badge).backgroundColor;
      ghostTxt.textContent = '品牌 '+dragging;
      ghost.style.opacity='1';
      moveGhost(e);
      chip.setPointerCapture(e.pointerId);
    });
    chip.addEventListener('pointermove', function(e){
      if(dragging!==chip.dataset.brand) return;
      moveGhost(e);
      // dragover 检测
      if(isOverMap(e)) mapBox.classList.add('dragover');
      else mapBox.classList.remove('dragover');
    });
    chip.addEventListener('pointerup', function(e){
      if(dragging!==chip.dataset.brand) return;
      chip.classList.remove('dragging');
      ghost.style.opacity='0';
      mapBox.classList.remove('dragover');
      if(isOverMap(e)){ revealBrand(dragging); }
      dragging=null;
    });
    chip.addEventListener('pointercancel', function(){
      chip.classList.remove('dragging'); ghost.style.opacity='0'; mapBox.classList.remove('dragover'); dragging=null;
    });
  });
  function moveGhost(e){ ghost.style.left=e.clientX+'px'; ghost.style.top=e.clientY+'px'; }
  function isOverMap(e){
    var r=mapBox.getBoundingClientRect();
    return e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom;
  }
  // 点击 chip 也可放置（可达性兜底）
  ['chipA','chipB'].forEach(function(id){
    var chip=document.getElementById(id);
    chip.addEventListener('dblclick', function(){ if(!chip.classList.contains('placed')) revealBrand(chip.dataset.brand); });
  });

  /* ---------- 5. 猜测选择 ---------- */
  var guess={A:null,B:null};
  document.querySelectorAll('.opt-pair').forEach(function(pair){
    var slot=pair.dataset.for;
    pair.querySelectorAll('.opt').forEach(function(opt){
      opt.addEventListener('click', function(){
        if(!placed.A||!placed.B) return;
        pair.querySelectorAll('.opt').forEach(function(o){o.classList.remove('sel');});
        opt.classList.add('sel');
        guess[slot]=opt.dataset.val;
        // 若两个选了同一品牌，自动把另一个设为相反（互斥引导）
        var other = slot==='A'?'B':'A';
        if(guess[other]===guess[slot]){
          guess[other]=null;
          document.querySelector('.opt-pair[data-for="'+other+'"]').querySelectorAll('.opt').forEach(function(o){o.classList.remove('sel');});
        }
        document.getElementById('submitGuess').disabled = !(guess.A && guess.B);
      });
    });
  });

  window.submitGuess = function(){
    if(!guess.A||!guess.B) return;
    revealed = true;                 // 解锁真实品牌名（tooltip / 图层开关）
    relabelLayersAfterReveal();
    var correct = (guess.A===brandMap.A && guess.B===brandMap.B);
    renderVerdict(correct);
    go(2);
  };

  function renderVerdict(correct){
    var v=document.getElementById('verdict');
    var realA=BRAND_INFO[brandMap.A].name, realB=BRAND_INFO[brandMap.B].name;
    v.className='verdict '+(correct?'ok':'no');
    if(correct){
      v.innerHTML=''
        +'<div class="vi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
        +'<div><h3>判断正确！你已经读懂了分布规律</h3>'
        +'<p><b style="color:var(--a)">品牌 A = '+realA+'</b>　·　<b style="color:var(--l)">品牌 B = '+realB+'</b>。'
        +'扎堆中心顶级地段的是 % Arabica，铺满全城含郊区的是瑞幸。下面看看它们各自的选址逻辑。</p></div>';
    } else {
      v.innerHTML=''
        +'<div class="vi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 8v5M12 16.5v.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="2"/></svg></div>'
        +'<div><h3>再看一眼分布 —— 正确答案是这样</h3>'
        +'<p>正确答案：<b style="color:var(--a)">品牌 A = '+realA+'</b>　·　<b style="color:var(--l)">品牌 B = '+realB+'</b>。'
        +'关键线索：<b>门店高度扎堆市中心、数量很少</b>的是 % Arabica；<b>连郊区都铺、点位密集</b>的是瑞幸。往下看解析就明白了。</p></div>';
    }
  }

  /* ---------- 6. ECharts 雷达 + 柱状 ---------- */
  var radarChart, barChart, radarBuilt=false, barBuilt=false;
  function buildRadar(){
    if(radarBuilt) return; radarBuilt=true;
    var AC='#0C3F31', LC='#12327E';
    // 雷达
    radarChart = echarts.init(document.getElementById('radarChart'));
    radarChart.setOption({
      tooltip:{confine:true},
      legend:{data:['% Arabica','瑞幸咖啡'],bottom:0,itemWidth:14,itemHeight:8,
        textStyle:{fontSize:12,color:'#6C6455'}},
      radar:{
        indicator: D.radar.dims.map(function(d){return {name:d, max:100};}),
        radius:'62%', center:['50%','48%'],
        axisName:{fontSize:10.5,color:'#6C6455'},
        splitLine:{lineStyle:{color:'#E2DBCB'}},
        splitArea:{areaStyle:{color:['rgba(250,247,239,.4)','rgba(241,237,226,.4)']}},
        axisLine:{lineStyle:{color:'#E2DBCB'}}
      },
      series:[{
        type:'radar', symbolSize:4,
        data:[
          {value:D.radar.arabica, name:'% Arabica',
            lineStyle:{color:AC,width:2}, itemStyle:{color:AC}, areaStyle:{color:'rgba(30,156,119,.22)'}},
          {value:D.radar.luckin, name:'瑞幸咖啡',
            lineStyle:{color:LC,width:2}, itemStyle:{color:LC}, areaStyle:{color:'rgba(61,116,232,.20)'}}
        ]
      }]
    });
    setTimeout(function(){ radarChart&&radarChart.resize(); },40);
  }
  function buildBar(){
    if(barBuilt) return; barBuilt=true;
    var AC='#0C3F31', LC='#12327E';
    // 柱状（各区门店数）
    var cats = D.bar.map(function(b){return b.district;});
    barChart = echarts.init(document.getElementById('barChart'));
    barChart.setOption({
      tooltip:{trigger:'axis', confine:true, axisPointer:{type:'shadow'}},
      legend:{data:['% Arabica','瑞幸(采样点位)'],bottom:0,itemWidth:14,itemHeight:8,textStyle:{fontSize:12,color:'#6C6455'}},
      grid:{left:'4%',right:'5%',top:'18%',bottom:'15%',containLabel:true},
      xAxis:{type:'category',data:cats,
        axisLabel:{fontSize:10,color:'#6C6455',interval:0,rotate:38},
        axisLine:{lineStyle:{color:'#DED6C5'}},axisTick:{show:false}},
      yAxis:{type:'value',name:'门店数 / 点位数',nameGap:12,nameTextStyle:{fontSize:10,color:'#9A917F',align:'left'},
        splitLine:{lineStyle:{color:'#EBE5D8'}},axisLabel:{fontSize:10,color:'#9A917F'}},
      series:[
        {name:'% Arabica',type:'bar',data:D.bar.map(function(b){return b.arabica;}),
          itemStyle:{color:AC,borderRadius:[3,3,0,0]},barMaxWidth:16},
        {name:'瑞幸(采样点位)',type:'bar',data:D.bar.map(function(b){return b.luckin;}),
          itemStyle:{color:LC,borderRadius:[3,3,0,0]},barMaxWidth:16}
      ]
    });
    setTimeout(function(){ barChart&&barChart.resize(); },40);
  }
  // 对比表
  var CMP=[
    ['市场定位','高端精品（32–45元/杯）','高性价比大众（9.9–16元/杯）'],
    ['主导区位因子','高消费市场 + 顶级商圈形象','人口 / 交通流量 + 网点密度'],
    ['空间分布','高度集聚于中心城区顶级地段','中心到郊区广域高密度覆盖'],
    ['门店密度','极低（全市约20家，宁缺毋滥）','极高（规模连锁，遍布全市）'],
    ['店型与成本','大店 / 地标店，承受高地租','快取小店，低成本，易扩张'],
    ['到店逻辑','目的地型（专程打卡）','便利型（顺路买一杯）'],
    ['郊区布局','几乎没有','大量（松江/嘉定/奉贤/崇明等）']
  ];
  function buildCmpTable(){
    var body=document.getElementById('cmpBody');
    if(body.children.length) return;
    body.innerHTML = CMP.map(function(r){
      return '<tr><td>'+r[0]+'</td><td class="ca-cell">'+r[1]+'</td><td class="cl-cell">'+r[2]+'</td></tr>';
    }).join('');
  }

  /* ---------- 7. 舞台切换 ---------- */
  var stages=[0,1,2,3];
  window.go = function(n){
    stages.forEach(function(i){
      document.getElementById('stage'+i).classList.toggle('on', i===n);
    });
    // nav
    document.querySelectorAll('.snav').forEach(function(el,i){
      el.classList.toggle('active', i===n);
      el.classList.toggle('done', i<n);
    });
    window.scrollTo({top:0,behavior:'smooth'});
    if(n===2){ buildCmpTable(); }   // 图表改为点击卡片才构建（见下方 initClickReveal）
  };
  // nav 点击（仅允许跳到已解锁的步骤：这里放开自由跳，但 stage2 需已提交）
  document.querySelectorAll('.snav').forEach(function(el){
    el.addEventListener('click', function(){
      var n=+el.dataset.goto;
      if(n===2 && !(guess.A&&guess.B)) { go(1); return; }
      go(n);
    });
  });

  /* ---------- tooltip ---------- */
  var tip=document.getElementById('tip');
  function showTip(e,name,dist){ tip.innerHTML='<b>'+name+'</b>'+(dist?' · '+dist:''); tip.style.opacity='1'; moveTip(e); }
  function moveTip(e){ tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY-8)+'px'; }
  function hideTip(){ tip.style.opacity='0'; }

  /* ---------- 响应式图表 ---------- */
  new ResizeObserver(function(){
    radarChart&&radarChart.resize(); barChart&&barChart.resize();
  }).observe(document.body);

  /* ---------- 点击揭示：区位因子逐条 + 图表卡 ---------- */
  (function initClickReveal(){
    // 因子条目：点击展开真实内容
    document.querySelectorAll('.fac-item').forEach(function(li){
      li.addEventListener('click', function(){ li.classList.add('open'); });
    });
    // 图表卡：点击锁层后构建并显示对应图表
    document.querySelectorAll('.chart-lock').forEach(function(lock){
      lock.addEventListener('click', function(){
        var which=lock.getAttribute('data-chart');
        var card=lock.closest('.chart-card');
        card.classList.add('revealed');
        if(which==='radar') buildRadar(); else if(which==='bar') buildBar();
      });
    });
  })();

  /* ---------- 8. 地图矢量缩放与平移（SVG transform，无损清晰） ---------- */
  (function mapZoomPan(){
    var svg=document.getElementById('map-svg');
    var vp=document.getElementById('g-viewport');
    var box=document.getElementById('mapBox');
    if(!svg||!vp||!box) return;
    var VW=760, VH=720;              // viewBox 尺寸
    var st={k:1,tx:0,ty:0}, MIN=1, MAX=9;

    function apply(){
      vp.setAttribute('transform','translate('+st.tx.toFixed(2)+','+st.ty.toFixed(2)+') scale('+st.k.toFixed(4)+')');
      rescaleMarkers();
    }
    // 反向补偿：放大 k 倍时，点半径 / 字号 除以 k，使它们在屏幕上保持恒定精准尺寸
    function rescaleMarkers(){
      var k=st.k;
      var circles=vp.querySelectorAll('circle[data-br]');
      for(var i=0;i<circles.length;i++){
        var c=circles[i], br=parseFloat(c.getAttribute('data-br'));
        c.setAttribute('r',(br/k).toFixed(3));
      }
      // 标签字号反向补偿（地铁/商圈标签、行政区名），保持恒定可读尺寸
      var labels=vp.querySelectorAll('.cbd-label, .dist-label, .fac-label');
      for(var j=0;j<labels.length;j++){
        var t=labels[j];
        if(!t.getAttribute('data-bfs')){
          var fs=parseFloat(getComputedStyle(t).fontSize)||9;
          t.setAttribute('data-bfs',fs);
        }
        var bfs=parseFloat(t.getAttribute('data-bfs'));
        // 区名：随放大逐渐增大，放到最大时屏幕字号约为基础的1.3倍（+30%），放大后更清晰；CBD/加工厂标签保持恒定
        if(t.getAttribute('class') && t.getAttribute('class').indexOf('dist-label')>=0){
          var grow=1+0.3*(k-1)/(MAX-1); if(grow<1) grow=1;
          t.style.fontSize=(bfs*grow/k).toFixed(2)+'px';
        } else {
          t.style.fontSize=(bfs/k).toFixed(2)+'px';
        }
        // 带 data-cy 的标签(CBD)：偏移量随 k 反向补偿，字始终贴着圆点
        if(t.getAttribute('data-cy')){
          var cy=parseFloat(t.getAttribute('data-cy')), off=parseFloat(t.getAttribute('data-off'))||9;
          t.setAttribute('y',(cy-off/k).toFixed(2));
        }
      }
    }
    // 屏幕坐标 -> SVG 用户坐标（自动处理 viewBox 与 preserveAspectRatio 的留白）
    function toSvg(cx,cy){
      var ctm=svg.getScreenCTM(); if(!ctm) return {x:0,y:0};
      var pt=svg.createSVGPoint(); pt.x=cx; pt.y=cy;
      var p=pt.matrixTransform(ctm.inverse());
      return {x:p.x,y:p.y};
    }
    function ctmScale(){ var ctm=svg.getScreenCTM(); return ctm?ctm.a:1; }
    function clampPan(){
      if(st.k<=1.0001){ st.tx=0; st.ty=0; return; }
      st.tx=Math.max(VW-st.k*VW, Math.min(0, st.tx));
      st.ty=Math.max(VH-st.k*VH, Math.min(0, st.ty));
    }
    // 以 (sx,sy)（SVG 用户坐标）为锚缩放到 newK
    function zoomTo(newK,sx,sy){
      newK=Math.max(MIN,Math.min(MAX,newK));
      st.tx=sx-newK*(sx-st.tx)/st.k;
      st.ty=sy-newK*(sy-st.ty)/st.k;
      st.k=newK; clampPan(); apply();
    }

    // 滚轮：以光标为中心缩放
    svg.addEventListener('wheel', function(e){
      e.preventDefault();
      var sp=toSvg(e.clientX,e.clientY);
      zoomTo(st.k*(e.deltaY<0?1.15:1/1.15), sp.x, sp.y);
    }, {passive:false});

    // 拖拽平移（作用于地图内部；与侧栏拖品牌卡互不干扰）
    var panning=false,lx=0,ly=0;
    svg.addEventListener('pointerdown', function(e){
      if(e.pointerType==='mouse' && e.button!==0) return;
      panning=true; lx=e.clientX; ly=e.clientY;
      box.classList.add('panning');
      try{ svg.setPointerCapture(e.pointerId); }catch(_){}
    });
    svg.addEventListener('pointermove', function(e){
      if(!panning) return;
      var sc=ctmScale()||1;
      st.tx+=(e.clientX-lx)/sc; st.ty+=(e.clientY-ly)/sc;
      lx=e.clientX; ly=e.clientY; clampPan(); apply();
    });
    function endPan(e){
      if(!panning) return; panning=false; box.classList.remove('panning');
      try{ svg.releasePointerCapture(e.pointerId); }catch(_){}
    }
    svg.addEventListener('pointerup', endPan);
    svg.addEventListener('pointercancel', endPan);

    // 按钮：以视野中心为锚
    function btn(f){ zoomTo(st.k*f, VW/2, VH/2); }
    var zi=document.getElementById('zoomIn'),zo=document.getElementById('zoomOut'),zr=document.getElementById('zoomReset');
    if(zi) zi.addEventListener('click', function(){ btn(1.4); });
    if(zo) zo.addEventListener('click', function(){ btn(1/1.4); });
    if(zr) zr.addEventListener('click', function(){ st.k=1; st.tx=0; st.ty=0; apply(); });

    apply();
  })();

})();
