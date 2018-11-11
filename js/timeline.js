(function(global, d3, _) {
  const DEFAULT_X_ACCESSOR = d => d.x;
  const DEFAULT_Y_ACCESSOR = d => d.y;
  const DEFAULT_X_DOMAIN = [undefined, undefined];
  const DEFAULT_Y_DOMAIN = [0, undefined];
  const DEFAULT_SERIES_SCHEME = d3.interpolateInferno;
  const DEFAULT_SERIES_KEY_ACCESSOR = d => d.key;
  const DEFAULT_SERIES_DATA_ACCESSOR = d => d.curve;
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
   * Return the most common data type in an array.
   * @param {array<*>} array The data array.
   * @param {function} valueAccessor A function to return the value for each datum in the array.
   * @param {number} limit The number of datum to consider.
   */
  function type(array, valueAccessor, limit) {
    let value;
    let i = -1;
    let n = limit || array.length;
    const counts = {};
    if (valueAccessor) {
      while (++i < n) {
        value = valueAccessor(array[i], i, array);
        type = value === null ? 'null' : typeof value;
        if (counts[type]) {
          counts[type] += 1;
        } else {
          counts[type] = 1;
        }
      }
    } else {
      while (++i < n) {
        value = array[i];
        type = value === null ? 'null' : typeof value;
        if (counts[type]) {
          counts[type] += 1;
        } else {
          counts[type] = 1;
        }
      }
    }
    let maxCount = -Infinity;
    let maxType = undefined;
    Object.keys(counts).forEach((k) => {
      if (counts[k] > maxCount) {
        maxCount = counts[k];
        maxType = k;
      }
    });
    return maxType;
  }

  /**
   * Return all possible values for data in an array.
   * @param {array<*>} array The data array.
   * @param {function} valueAccessor A function to return the value for each datum in the array.
   */
  function domain(array, valueAccessor) {
    let value;
    let i = -1;
    let n = array.length;
    const domain = [];
    const seen = new Set();
    if (valueAccessor) {
      while (++i < n) {
        value = valueAccessor(array[i], i, array);
        if (!seen.has(value)) {
          seen.add(value);
          domain.push(value);
        }
      }
    } else {
      while (++i < n) {
        value = array[i];
        if (!seen.has(value)) {
          seen.add(value);
          domain.push(value);
        }
      }
    }
    return domain;
  }

  /**
   * Return the extent of multiple data series.
   * @param {array<*>} series The data series.
   * @param {function} dataAccessor A function to return the data array for each series.
   * @param {function} valueAccessor A function to return the value for each datum in a series.
   */
  function seriesExtent(series, dataAccessor, valueAccessor) {
    let gMin;
    let gMax;
    let nMin;
    let nMax;
    let n = series.length;
    let i = -1;
    const seriesData = series.map(dataAccessor);
    while (++i < n) {
      // Get the initial extent.
      ([gMin, gMax] = d3.extent(seriesData[i], valueAccessor));
      while (++i < n) {
        // Compare remaining extents.
        ([nMin, nMax] = d3.extent(seriesData[i], valueAccessor));
        if (nMin < gMin) { gMin = nMin; }
        if (nMax > gMax) { gMax = nMax; }
      }
    }
    return [gMin, gMax];
  }

  /**
   * Merge the default extent with the extent extracted from the data series.
   * @param {array<*>} series The data series.
   * @param {function} dataAccessor A function to return the data array for each series.
   * @param {function} valueAccessor A function to return the value for each datum in a series.
   * @param {array<*>} dfault The default extent values.
   */
  function mergeExtent(series, dataAccessor, valueAccessor, dfault) {
    const extent = dfault[0] === undefined || dfault[1] === undefined
      ? seriesExtent(series, dataAccessor, valueAccessor)
      : dfault;
    if (dfault[0] !== undefined) {
      extent[0] = dfault[0];
    }
    if (dfault[1] !== undefined) {
      extent[1] = dfault[1];
    }
    return extent;
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
    let xDomain = DEFAULT_X_DOMAIN;
    let yDomain = DEFAULT_Y_DOMAIN;
    let seriesScheme = DEFAULT_SERIES_SCHEME;
    let seriesKeyAccessor = DEFAULT_SERIES_KEY_ACCESSOR;
    let seriesDataAccessor = DEFAULT_SERIES_DATA_ACCESSOR;
    let curve = DEFAULT_CURVE;
    // Local variables are scoped to a DOM element; they are not shared between small multiple instances generated by
    // the same timeline object.
    const localId = d3.local();
    const localCurve = d3.local();
    const localScales = d3.local();
    const localSketching = d3.local();

    const dispatch = d3.dispatch(
      'sketchStart',
      'sketch',
      'sketchEnd'
    );

    function timeline(svgSelection) {
      svgSelection.each(function(data) {
        // Set the chart ID.
        if (localId.get(this) === undefined) { localId.set(this, _.uniqueId('timeline')); }
        if (localCurve.get(this) === undefined) { localCurve.set(this, []); }

        // Calculate chart properties.
        const svg = d3.select(this);
        const props = getProps(svg);
        const scales = getScales(data, props);
        const axes = getAxes(scales);

        // Persist the scales locally.
        localScales.set(this, scales);

        // Render the chart skeleton.
        renderChart(svg, props);
        renderAxes(svg, props, axes);

        // Render the chart content.
        renderSeries(svg, props, scales, data);
        renderSketch(svg, props, scales, data);
        renderEvents(svg, props, scales, data);
        renderOverlay(svg, props, scales, data);
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
      const xExtent = mergeExtent(data.series, seriesDataAccessor, xAccessor, xDomain);
      const yExtent = mergeExtent(data.series, seriesDataAccessor, yAccessor, yDomain);

      const keys = data.series.map(seriesKeyAccessor);
      const keyType = type(keys)
      const keyExtent = keyType === 'number' ? d3.extent(keys) : domain(keys);

      const xRange = [0, props.chartWidth];
      const yRange = [props.chartHeight, 0];

      return {
        x: d3.scaleLinear().domain(xExtent).range(xRange),
        y: d3.scaleLinear().domain(yExtent).range(yRange),
        key: keyType === 'number'
          ? d3.scaleSequential(seriesScheme).domain(keyExtent)
          : d3.scaleOrdinal(seriesScheme).domain(keyExtent),
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
     * Return the most recent touches in the chart coordinate system.
     * @param {object} svg The SVG selection
     * @param {boolean} invert If true, the touches are inverted to the data domain.
     */
    function getChartTouches(svg, invert) {
      const el = svg.select('.sketch-content').node();
      return invert
        ? getInverse(d3.touches(el))
        : d3.touches(el);
    }
    
    /**
     * Invert the given points into the data domain.
     * @param {object} svg The SVG selection
     * @param {array<array<number>>} points The points to invert
     */
    function getInverse(svg, points) {
      const {
        x: xScale,
        y: yScale,
      } = localScales.get(svg.node());
      return points.map(p => [xScale.invert(p[0]), yScale.invert(p[1])]);
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
        key: keyScale,
      } = scales;

      line = d3.line()
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
          .attr('stroke', d => keyScale(seriesKeyAccessor(d)))
          .attr('opacity', 0.5)
        .merge(series)
          .attr('d', d => line(seriesDataAccessor(d)));
    }

    /**
     * Render the sketched timeline.
     * @param {object} svg The SVG selection
     */
    function renderSketch(svg) {
      const curve = localCurve.get(svg.node());
      const line = d3.line()
        .x(d => d[0])
        .y(d => d[1])
        .curve(d3.curveLinear);
      const container = svg.select('.sketch-content');
      let sketch = container
        .selectAll('.series')
        .data([curve]);
      sketch.exit().remove();
      sketch = sketch
        .enter()
        .append('path')
          .attr('class', 'series')
          .attr('fill', 'none')
          .attr('stroke', 'black')
          .attr('stroke-width', 2)
        .merge(sketch)
          .attr('d', line);
    }

    function renderEvents(svg, props, scales, data) {

    }

    /**
     * Render the overlay for touch events.
     * @param {object} svg The SVG selection
     * @param {object} props The chart properties
     * @param {object} scales The chart scales
     * @param {object} data The data model
     */
    function renderOverlay(svg, props, scales, data) {
      let overlay = svg
        .selectAll('.touch-overlay')
        .data([0]);
      overlay = overlay
        .enter()
        .append('g')
          .attr('class', 'touch-overlay')
          .on('touchstart', _.partial(onTouchStart, svg))
          .on('touchmove', _.partial(onTouchMove, svg))
          .on('touchend', _.partial(onTouchEnd, svg))
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

    function onTouchStart(svg) {
      // TODO: Determine if sketching starts.
      const el = svg.node();
      const curve = []; // TODO: Handle sketching of partial segments.
      localCurve.set(el, curve);
      localSketching.set(el, true);
      dispatch.call('sketchStart', el, getInverse(svg, curve));
    }

    function onTouchMove(svg) {
      const el = svg.node();
      if (localSketching.get(el)) {
        const curve = localCurve.get(el);
        const points = getChartTouches(svg);
        curve.push(points[0]);
        renderSketch(svg);
        dispatch.call('sketch', el, getInverse(svg, curve));
      }
    }

    function onTouchEnd(svg) {
      const el = svg.node();
      const curve = localCurve.get(el);
      // TODO: Post-processing of curve?
      dispatch.call('sketchEnd', el, getInverse(svg, curve));
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
    };

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
    };

    /**
     * If x is specified, set the x accessor to the given function or path and return this timeline. Otherwise, return
     * the current accessor.
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
    };

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
    };

    /**
     * If x is specified, set the x domain to the given [min, max] extent and return this timeline. Otherwise, return
     * the current x domain.
     * @param {array<number|undefined} x The x domain. Values set to undefined will be calculated dynamically. If null,
     * the x domain is set to its default value, which is [undefined, undefined].
     */
    timeline.xDomain = function(x) {
      if (x === null) {
        xDomain = DEFAULT_X_DOMAIN;
        return timeline;
      } else if (x !== undefined) {
        xDomain = x;
        return timeline;
      }
      return xDomain.slice();
    };

    /**
     * If y is specified, set the y domain to the given [min, max] extent and return this timeline. Otherwise, return
     * the current y domain.
     * @param {array<number|undefined} y The y domain. Values set to undefined will be calculated dynamically. If null,
     * the y domain is set to its default value, which is [0, undefined].
     */
    timeline.yDomain = function(y) {
      if (y === null) {
        yDomain = DEFAULT_Y_DOMAIN;
        return timeline;
      } else if (y !== undefined) {
        yDomain = y;
        return timeline;
      }
      return yDomain.slice();
    };

    /**
     * If s is specified, set the series color scheme to the given function and return this timeline. Otherwise, return
     * the current scheme.
     * @param {function} s The color scheme. See d3-scale-chromatic. If null, the color scheme is set to its default
     * value, which is d3-interpolateInferno.
     */
    timeline.seriesScheme = function(s) {
      if (s === null) {
        seriesScheme = DEFAULT_SERIES_SCHEME;
        return timeline;
      } else if (s !== undefined) {
        seriesScheme = s;
        return timeline;
      }
      return seriesScheme; 
    };

    /**
     * If k is sepcified, set the series key accessor to the given function or path and return this timeline. Otherwise,
     * return the current accessor.
     * @param {function|string|null|undefined} k The series key accessor. If a string, a function is created that will
     * access the value at the given path. If null, the series key accessor is set to its default value, which is
     * d => d.key.
     */
    timeline.seriesKey = function(k) {
      if (k === null) {
        seriesKeyAccessor = DEFAULT_SERIES_KEY_ACCESSOR;
        return timeline;
      } else if (k !== undefined) {
        seriesKeyAccessor = _.iteratee(k);
        return timeline;
      }
      return seriesKeyAccessor;
    };

    /**
     * If d is sepcified, set the series data accessor to the given function or path and return this timeline.
     * Otherwise, return the current accessor.
     * @param {function|string|null|undefined} d The series data accessor. If a string, a function is created that will
     * access the value at the given path. If null, the series data accessor is set to its default value, which is
     * d => d.durve.
     */
    timeline.seriesData = function(d) {
      if (d === null) {
        seriesDataAccessor = DEFAULT_SERIES_DATA_ACCESSOR;
        return timeline;
      } else if (d !== undefined) {
        seriesDataAccessor = _.iteratee(d);
        return timeline;
      }
      return seriesDataAccessor;
    };

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
    };

    /**
     * Add, remove, or get the callback for the specified event types. See d3-dispatch.on.
     */
    timeline.on = function() {
      const value = dispatch.on.apply(dispatch, arguments);
      return value === dispatch ? timeline : value;
    };

    return timeline;
  }

})(window, window.d3, window._);