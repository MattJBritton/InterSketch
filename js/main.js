(function(global, timeline, d3, _) {
  // Example: labor statistics data (see https://beta.observablehq.com/@mbostock/d3-multi-line-chart)
  d3.tsv("static/unemployment.tsv", (d, i, columns) => ({
    name: d.name.replace(/, ([\w-]+).*/, " $1"),
    values: columns.slice(1).map(k => +d[k]),
  })).then(series => {
    // Example: create the main timeline component.
    const mainTimeline = timeline()
      .x((d, i) => i)
      .y(d => d)
      .margin({ top: 10, right: 10, left: 30, bottom: 30 })
      .axis({ bottom: true, left: true })
      .curve(d3.curveMonotoneX);

    // Example: render the main timeline component.
    d3.select('#timeline')
      .datum({
        series: series.map(s => s.values),
        sketch: [],
      })
      .call(mainTimeline);
  });

})(window, window.timeline, window.d3, window._);