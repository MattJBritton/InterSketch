(function(global, timeline, d3, moment, _) {

  let formatTime = d3.timeFormat("%B %d, %Y");
  let startDate = new Date(2017,5,1);
  let endDate = new Date(2017,6,25);
  let strictIsoParse = d3.utcParse("%Y-%m-%dT%H:%M:%S.%L%Z");
  let div = d3.select("#timeline");
  let loaded_data = [];

  //function to find null y values that need to be interpolated
  function find_null_indices(d,i){

    //hardcoded 10 as a number that is unlikely to be real
    //based on manual introspection of data
    if(d.y <= 10 || d.y == null) {
      null_indices.push(i);
      return true;
    }
      return false;
  }

  //interpolate to replace 0 values
  function interpolate(series) {

    null_indices = [];
    series.filter(
      (d,i) => find_null_indices(d,i));
    validX = series.filter((d,i) => !null_indices.includes(i))
      .map(d => d.x);
    validY = series.filter((d,i) => !null_indices.includes(i))
      .map(d => d.y);
    missingX = series.filter((d,i) => null_indices.includes(i))
      .map(d => d.x);
    missingY = everpolate.linear(missingX, validX, validY);

    return series.map((d,i) => ({
          x : d.x,
          y : null_indices.includes(i)?missingY[null_indices.indexOf(i)]:d.y
    }))
  }

  //distance function for DTW
  distFunc = function(a, b) {
    return Math.pow(Math.abs(a-b), 2);
    //return Math.abs(a-b);
  };

  function roundForDTW(d) {
    return Math.round(d*10)/10.;
  }

  function calculateDTW(sketch){

    mapDTW = {}
    //turn sketch into X:Y dict
    mapSketch = {}
    sketch.forEach(d => mapSketch[roundForDTW(d[0])] = d[1]);

    //iterate through each curve and find points in the curve with the same X
    //DTW library needs exact pairs
    Object.entries(loaded_data[0].series).forEach(outer => {

      tempCoordinates = [];
      tempSketchCoordinates = [];
      key = outer[1].date;
      value = outer[1];

      value.curve.forEach(inner =>{

        x = roundForDTW(inner.x);
        if(x in mapSketch) {

          tempCoordinates.push(inner.y);
          tempSketchCoordinates.push(mapSketch[x]);
        }
      })

      if(tempCoordinates.length >= 3) {

        mapDTW[key] = {
          'sketch': tempSketchCoordinates, 
          'data' : tempCoordinates
        };
      }
    })

    //if no common points between sketch and data, return nothing
    if(mapDTW.length < 3) {
      return [];
    }

    matches = [];
    //calculate DTW for each series
    Object.entries(mapDTW).forEach(d=> {

      key = d[0];
      value = d[1];
      var dist = new DynamicTimeWarping(
                                      value['data'], 
                                      value['sketch'], 
                                      distFunc
                                      ).getDistance();

      //arbitrary treshold for now
      if (dist/value['data'].length <= 400){

        matches.push(key);
      };
    })

    return matches;
  }

function generate_cluster(sketch, bolCreateMultiple) {

  matches = calculateDTW(sketch);

  if(bolCreateMultiple && matches.length>0) {

    add_timeline(loaded_data[0].series.filter(
      d => matches.includes(d.date)), sketch);

    loaded_data[0].series = loaded_data[0].series.filter(
      d => !matches.includes(d.date))

    //reload main timeline
    call_timeline(0);

    //new timeline
    call_timeline(loaded_data.length-1);         

  } else {

    loaded_data[0]["series"].forEach( d => {

      d.match = matches.includes(d.date);
    });

    call_timeline(0);
  }  
}

function add_timeline(series, sketch) {

    loaded_data.push({
      'series': series,
      'sketch': sketch,
      'timeline': build_timeline(),
      'svg': div.append("svg")
        .attr("width", 800)
        .attr("id", "svg_"+loaded_data.length-1)
        .style("top", (loaded_data.length-1)*220)
    })
}

function build_timeline() {

  // Create the main timeline component.
  const now = moment();
  const new_timeline = timeline()
    .margin({ top: 10, right: 10, left: 30, bottom: 30 })
    .axis({ bottom: true, left: true })
    .curve(d3.curveMonotoneX)
    .x(d => d.x)
    .y(d => d.y)
    .xDomain([0, 24])
    .yDomain([0, 400])
    .seriesKey(s => now.diff(moment(s.date), 'days'))
    .seriesData(s => s.curve)
    .on('sketchStart', (curve) => {
      //console.log('sketchStart:', curve);
    })
    .on('sketch', (curve) => {
      //console.log('sketch:', curve);
    })
    .on('sketchEnd', function(curve){
      //console.log('sketchEnd', curve);
      loaded_data[0].sketch = curve;
      generate_cluster(curve, false);
    })
    .on('sketchSave', function(curve, points){
      console.log('sketchSave', curve, points);
      loaded_data[0].sketch = [];
      generate_cluster(curve, true);
    }); 

    return new_timeline; 
}  

  function call_timeline(timeline_num) {

    loaded_data[timeline_num].svg
      .datum({
        series: loaded_data[timeline_num].series,
        sketch: loaded_data[timeline_num].sketch,
      })
      .call(loaded_data[timeline_num].timeline);  
  }

  //LOAD DATA
  Promise.all([
    d3.json("static/treatments.json"),
    d3.json("static/entries.json")
  ])
  .then(([events, series]) => {

    events_grouped = d3.nest()
      .key(d => d.date)
      .sortValues((a,b) => parseFloat(a.time) - parseFloat(b.time))
      .entries(
        events
        .filter(d =>
          d.hasOwnProperty('created_at') 
          && d.hasOwnProperty('eventType')
          && strictIsoParse(d.created_at.replace(" ","T")).getTime()
            >= startDate.getTime()
          && strictIsoParse(d.created_at.replace(" ","T")).getTime()
            <= endDate.getTime())
        .filter(d =>
          (d.hasOwnProperty("insulin") && d.insulin != null) //ignore duplicate GCM readings in the treatment file
          || (d.hasOwnProperty("carbs") && d.carbs != null)
        )
        .map(d => ({
            date : moment.parseZone(d.created_at.replace(" ","T"))
              .startOf("day")._d,
            time : +d.created_at.substring(11,13) 
              + d.created_at.substring(14,16)/60,
            eventType : d.eventType  
          })
        )
      )    
      .map(group => ({
          date: group.key,
          events: group.values.map(
            d => ({x: d.time, eventType:d.eventType}))
        })
      )

    eventMap = {};
    events_grouped.forEach(d => eventMap[d.date] = d.events );

    return d3.nest()
      .key(d => d.date)
      .sortValues((a,b) => parseFloat(a.time) - parseFloat(b.time))
      .entries(
        series
        .filter(d =>
          d.hasOwnProperty('dateString') 
          && d.hasOwnProperty('sgv')
          && strictIsoParse(d.dateString.replace(" ","T")).getTime()
            >= startDate.getTime()
          && strictIsoParse(d.dateString.replace(" ","T")).getTime()
            <= endDate.getTime())
        .map(d => ({
            date : moment.parseZone(d.dateString.replace(" ","T"))
              .startOf("day")._d,
            time : +d.dateString.substring(11,13) 
              + d.dateString.substring(14,16)/60,
            value : +d.sgv    
          })    
        )
      )
      .map(group => ({
          date: group.key,
          curve: interpolate(group.values.map(
            d => ({x: d.time, y:d.value}))),
          events: eventMap[group.key]
        })
      //only return days that have close to a full 24 hours of data
      ).filter( group => d3.min(group.curve, d=> d.x) <= 1
        && d3.max(group.curve, d=> d.x) >= 23
      )
  })    
  .then(series => {

    add_timeline(series, []);

    // Render the main timeline component.
    call_timeline(0);
  });

})(window, window.timeline, window.d3, window.moment, window._);