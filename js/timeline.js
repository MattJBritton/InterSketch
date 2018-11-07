(function(global, d3, _) {
  const DEFAULT_X_ACCESSOR = (d) => d.x;
  const DEFAULT_Y_ACCESSOR = (d) => d.y;
  const DEFAULT_CURVE = d3.curveLinear;
  const DEFAULT_MARGIN_PROPS = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };
  const DEFAULT_AXIS_PROPS = {
    top: false,
    right: false,
    bottom: true,
    left: true,
  };

  /**
   * Return the extent of multiple data series.
   * @param {array<array<*>>} series The data series.
   * @param {function} accessor The value accessor.
   */
  function seriesExtent(series, accessor) {
    let gMin;
    let gMax;
    let nMin;
    let nMax;
    let n = series.length;
    let i = -1;
    while (++i < n) {
      // Get the initial extent.
      ([gMin, gMax] = d3.extent(series[i], accessor));
      while (++i < n) {
        // Compare remaining extents.
        ([nMin, nMax] = d3.extent(series[i], accessor));
        if (nMin < gMin) { gMin = nMin; }
        if (nMax > gMax) { gMax = nMax; }
      }
    }
    return [gMin, gMax];
  }

  /**
   * If the local variable exists, return the value. Otherwise, set the value to dfault and return dfault.
   * @param {object} local The local variable
   * @param {element} el The DOM element
   * @param {*} dfault The default value
   */
  function setLocalDefault(local, el, dfault) {
    let value = local.get(el);
    if (value === undefined) {
      local.set(el, dfault);
      return dfault;
    }
    return value;
  }


  /**
   * Create a new timeline generator.
   */
  global.timeline = function() {
    let marginProps = Object.assign({}, DEFAULT_MARGIN_PROPS);
    let axisProps = Object.assign({}, DEFAULT_AXIS_PROPS);
    let xAccessor = DEFAULT_X_ACCESSOR;
    let yAccessor = DEFAULT_Y_ACCESSOR;
    let curve = DEFAULT_CURVE;
    const localId = d3.local();

    function timeline(svgSelection) {
      svgSelection.each(function(data) {
        // Set the chart ID.
        if (localId.get(this) === undefined) { localId.set(this, _.uniqueId('timeline')); }

        // Calculate chart properties.
        const svg = d3.select(this);
        const props = getProps(svg);
        const scales = getScales(data, props);
        const axes = getAxes(scales);

        // Render the chart skeleton.
        renderChart(svg, props);
        renderAxes(svg, props, axes);

        // Render the chart content.
        renderSeries(svg, props, scales, data);
        renderSketch(svg, props, scales, data);
        renderEvents(svg, props, scales, data);
      });
    }

    function getProps(svg) {
      const svgEl = svg.node();
      const width = svgEl.clientWidth;
      const height = svgEl.clientHeight;
      const chartWidth = width - marginProps.left - marginProps.right;
      const chartHeight = height - marginProps.top - marginProps.bottom;

      return {
        width,
        height,
        chartWidth,
        chartHeight,
        margin: marginProps,
      };
    }

    function getScales(data, props) {
      const xDomain = seriesExtent(data.series, xAccessor);
      const yDomain = seriesExtent(data.series, yAccessor);
      const xRange = [0, props.chartWidth];
      const yRange = [props.chartHeight, 0];

      return {
        x: d3.scaleLinear().domain(xDomain).range(xRange),
        y: d3.scaleLinear().domain(yDomain).range(yRange),
      };
    }

    function getAxes(scales) {
      const axes = [];
      if (axisProps.top) {
        axes.push({ cls:'top', axis: d3.axisTop(scales.x) });
      }
      if (axisProps.right) {
        axes.push({ cls:'right', axis: d3.axisRight(scales.y) });
      }
      if (axisProps.bottom) {
        axes.push({ cls:'bottom', axis: d3.axisBottom(scales.x) });
      }
      if (axisProps.left) {
        axes.push({ cls:'left', axis: d3.axisLeft(scales.y) });
      }
      return axes;
    }

    /**
     * Render the chart skeleton, binding data to the appropriate content areas.
     * @param {object} svg The SVG selection
     * @param {object} props The chart properties
     * @param {object} data The data model
     */
    function renderChart(svg, props) {
      // Render the clipping path.
      const clipUrl = renderClipPath(svg, props);

      // Render the timeline series area. Clip.
      const seriesContainer = renderContainer(svg, props, 'series-content', clipUrl);

      // Render the sketch over other timelines but under events. Clip.
      const sketchContainer = renderContainer(svg, props, 'sketch-content', clipUrl);

      // Render the event container. Do not clip.
      const eventContainer = renderContainer(svg, props, 'event-content');

      // Render the axis container. Do not clip.
      const axisContainer = renderContainer(svg, props, 'axis-content');

      // Render the touch overlay.
      const overlay = renderOverlay(svg, props);
    }

    /**
     * Render the clipping path for the SVG.
     * @param {object} svg The SVG selection
     * @param {object} props The chart properties
     * @return {string} The URL for referencing the clip path
     */
    function renderClipPath(svg, props) {
      const id = localId.get(svg.node());
      let defs = svg
        .selectAll('defs')
        .data([0]);
      defs = defs
        .enter()
        .append('defs')
        .merge(defs);
      let clipPath = defs
        .selectAll('clipPath')
        .data([0])
      clipPath = clipPath
        .enter()
        .append('clipPath')
          .attr('id', `clip-${id}`)
        .merge(clipPath);
      let clipRect = clipPath
        .selectAll('rect')
        .data([0]);
      clipRect = clipRect
        .enter()
        .append('rect')
        .merge(clipRect)
          .attr('width', props.chartWidth)
          .attr('height', props.chartHeight);
      return `url(#clip-${id})`;
    }

    /**
     * Render a container for SVG content.
     * @param {object} svg The SVG selection
     * @param {object} props The chart properties
     * @param {string} cls The container class/label
     * @param {string} clipUrl The clip path URL. If given, the container content will be clipped
     */
    function renderContainer(svg, props, cls, clipUrl) {
      const update = svg
        .selectAll(`.${cls}`)
        .data([0]);
      const enter = update
        .enter()
        .append('g')
          .attr('class', cls);
      if (clipUrl) {
        enter.attr('clip-path', clipUrl);
      }
      return enter
        .merge(update)
          .attr('transform', `translate(${props.margin.left}, ${props.margin.top})`);
    }

    /**
     * Render the overlay for touch events.
     * @param {object} svg The SVG selection
     * @param {object} props The chart properties
     */
    function renderOverlay(svg, props) {
      let overlay = svg
        .selectAll('.touch-overlay')
        .data([0]);
      overlay = overlay
        .enter()
        .append('g')
          .attr('class', 'touch-overlay')
        .merge(overlay);
      let rect = overlay
        .selectAll('rect')
        .data([0]);
      rect = rect
        .enter()
        .append('rect')
        .merge(rect)
          .attr('width', props.width)
          .attr('height', props.height)
          .attr('opacity', 0.001);
      return overlay;
    }
    
    /**
     * Render the chart axes.
     * @param {object} svg The SVG selection
     * @param {object} props The chart properties
     * @param {array<object>} axes The chart axes properties
     */
    function renderAxes(svg, props, axes) {
      const container = svg.select('.axis-content');
      const update = container
        .selectAll('.axis')
        .data(axes);
      const enter = update
        .enter()
        .append('g')
          .attr('class', d => `axis ${d.cls}`)
          .attr('transform', d => {
            if (d.cls === 'right') {
              return `translate(${props.chartWidth}, 0)`;
            } else if (d.cls === 'bottom') {
              return `translate(0, ${props.chartHeight})`;
            }
            return `translate(0,0)`;
          });
      const exit = update
        .exit()
        .remove();
      enter
        .merge(update)
        .each(function(d) { d3.select(this).call(d.axis); });
    }

    /**
     * Render the timeline series.
     * @param {object} svg The SVG selection
     * @param {object} props The chart properties
     * @param {object} scales The chart scales
     * @param {object} data The data model
     */
    function renderSeries(svg, props, scales, data) {
      const {
        x: xScale,
        y: yScale,
      } = scales;
      const generator = d3.line()
        .x((d, i) => xScale(xAccessor(d, i)))
        .y((d, i) => yScale(yAccessor(d, i)))
        .curve(curve);
      const container = svg.select('.series-content');
      let series = container
        .selectAll('.series')
        .data(data.series ? data.series : []);
      series.exit().remove();
      series = series
        .enter()
        .append('path')
          .attr('class', 'series')
          .attr('fill', 'none')
          .attr('stroke', 'black')
          .attr('opacity', 0.25)
        .merge(series)
          .attr('d', generator);
    }

    /**
     * Render the sketched timeline.
     * @param {object} svg The SVG selection
     * @param {object} props The chart properties
     * @param {object} scales The chart scales
     * @param {object} data The data model
     */
    function renderSketch(svg, props, scales, data) {
      const {
        x: xScale,
        y: yScale,
      } = scales;
      const generator = d3.line()
        .x((d, i) => xScale(xAccessor(d, i)))
        .y((d, i) => yScale(yAccessor(d, i)))
        .curve(d3.curveLinear);

      const container = svg.select('.sketch-content');
      let sketch = container
        .selectAll('.sketch')
        .data(data.sketch ? [data.sketch] : []);
      sketch.exit().remove();
      sketch = sketch
        .enter()
        .append('path')
          .attr('class', 'series')
          .attr('fill', 'none')
          .attr('stroke', 'black')
        .merge(sketch)
          .attr('d', generator);
    }

    function renderEvents(svg, props, scales, data) {

    }

    /**
     * If m is specified, set the margins object and return this timeline. Otherwise, return the current margins.
     * @param {object|null|undefined} m The margins object. If null, the margins are set to their default values, which
     * are { top: 0, right: 0, bottom: 0, left: 0 }.
     */
    timeline.margin = function(m) {
      if (m === null) {
        marginProps = Object.assign({}, DEFAULT_MARGIN_PROPS);
        return timeline;
      } else if (typeof m === 'number') {
        marginProps = {
          top: m,
          right: m,
          bottom: m,
          left: m,
        };
        return timeline;
      } else if (typeof m === 'object') {
        marginProps = Object.assign({}, DEFAULT_MARGIN_PROPS, m);
        return timeline;
      }
      return marginProps;
    }

    /**
     * If a is specified, set the axes object and return this timeline. Otherwise, return the current margins.
     * @param {object|null|undefined} a The axes object. If null, the axes are set to their default values, which are
     * { top: false, right: false, bottom: true, left: true }.
     */
    timeline.axis = function(a) {
      if (a === null) {
        axisProps = Object.assign({}, DEFAULT_AXIS_PROPS);
        return timeline;
      } else if (a !== undefined) {
        axisProps = Object.assign({}, DEFAULT_AXIS_PROPS, a);
        return timeline;
      }
      return axisProps;
    }

    /**
     * If x is specified, set the x accessor to the given function or path. Otherwise, return the current accessor.
     * @param {function|string|null|undefined} x The x accessor. If a string, a function is created that will access the
     * value at the given path. If null, the x accessor is set to its default value, which is d => d.x.
     */
    timeline.x = function(x) {
      if (x === null) {
        xAccessor = DEFAULT_X_ACCESSOR;
        return timeline;
      } else if (x !== undefined) {
        xAccessor = _.iteratee(x);
        return timeline;
      }
      return xAccessor;
    }

    /**
     * If y is specified, set the y accessor to the given function or path and return this timeline. Otherwise, return
     * the current accessor.
     * @param {function|string|null|undefined} y The y accessor. If a string, a function is created that will access the
     * value at the given path. If null, the y accessor is set to its default value, which is d => d.y.
     */
    timeline.y = function(y) {
      if (y === null) {
        yAccessor = DEFAULT_Y_ACCESSOR;
        return timeline;
      } else if (y !== undefined) {
        yAccessor = _.iteratee(y);
        return timeline;
      }
      return yAccessor;
    }

    /**
     * If c is specified, set the curve factory and return this timeline. Otherwise, return the current curve factory.
     * @param {function|null|undefined} c The curve factory. If null, the curve factory is set to its default value,
     * which is d3.curveLinear.
     */
    timeline.curve = function(c) {
      if (c === null) {
        curve = DEFAULT_CURVE;
        return timeline;
      } else if (c !== undefined) {
        curve = c;
        return timeline;
      }
      return curve;
    }

    return timeline;
  }

})(window, window.d3, window._);