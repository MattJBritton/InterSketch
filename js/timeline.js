// TODO: Add implicit start and end control points
// TODO: Better padding.
(function(global, d3, _, contextMenu, vector) {
  const DEFAULT_SMALL_MULTIPLE = false;
  const DEFAULT_X_ACCESSOR = d => d.x;
  const DEFAULT_Y_ACCESSOR = d => d.y;
  const DEFAULT_X_DOMAIN = [undefined, undefined];
  const DEFAULT_Y_DOMAIN = [0, undefined];
  const DEFAULT_SERIES_DOMAIN = [undefined, undefined];
  const DEFAULT_SERIES_SCHEME = d3.interpolateInferno;
  const DEFAULT_SERIES_KEY_ACCESSOR = d => d.key;
  const DEFAULT_SERIES_DATA_ACCESSOR = d => d.curve;
  const DEFAULT_MATCH_ACCESSOR = d => d.match;
  const DEFAULT_CURVE = d3.curveLinear;
  const DEFAULT_MARGIN_PROPS = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };
  const DEFAULT_PADDING_PROPS = {
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
  const DEFAULT_TYPE = {
    fill: 'transparent',
    stroke: 'black',
    label: 'None',
    value: undefined,
  };
  const DOUBLE_TAP_INTERVAL = 350;
  const PRESS_INTERVAL = 300;
  const PINCH_BUFFER = 250;
  const MOVE_DELTA = 10;
  const SCALE_DELTA = 0.1;
  const CURVE_DISTANCE = 20;
  const POINT_DISTANCE = 20;


  /**
   * Scale points about another. Assumes points are in order. Modifies the points in place.
   * @param {array<array<number>>} points The points to scale.
   * @param {number} xScale The amount of scaling along the x axis.
   * @param {number} yScale The amount of scaling along the y axis.
   * @param {array<number>} [origin] The point to use as origin.
   */
  function scalePoints(points, xScale, yScale, origin) {
    if (points.length === 0) return;
    const translateX = origin ? origin[0] : points[0][0];
    const translateY = origin ? origin[1] : points[0][1];
    return points.forEach(p => {
      p[0] -= translateX;
      p[0] *= xScale;
      p[0] += translateX;
      p[1] -= translateY;
      p[1] *= yScale;
      p[1] += translateY;
    });
  }

  /**
   * Select all points between two points. Inclusive by default.
   * @param {array<number>} pointA The first point.
   * @param {array<number>} pointB The second point.
   * @param {boolean} exclusive If true, the given points are not included.
   */
  function sliceBetween(points, pointA, pointB, exclusive) {
    const min = pointA[0] < pointB[0] ? pointA[0] : pointB[0];
    const max = pointA[0] >= pointB[0] ? pointA[0] : pointB[0];

    let pos;
    const slice = [];
    const before = [];
    const after = [];
    points.forEach(point => {
      pos = point[0];
      if (pos < min) {
        before.push(point);
      } else if (pos > max) {
        after.push(point);
      } else if ((pos >= min
        && pos <= max
        && (!exclusive || (point !== pointA && point !== pointB)))) {
        slice.push(point);
      }
    });

    return [before, slice, after];
  }

  /**
   * Return the offset of an element relative to the page.
   * @param {Element} el The DOM element.
   */
  function getOffset(el) {
    const bounds = el.getBoundingClientRect();
    const document = window.document.documentElement;
    return {
      top: bounds.top + window.pageYOffset - document.clientTop,
      left: bounds.left + window.pageXOffset - document.clientLeft,
      width: bounds.width,
      height: bounds.height,
    };
  }

  /**
   * Calculate the centroid of a list of touches.
   * @param {TouchList|array<Touch>|Touch} touches
   */
  function touchCentroid(touches) {
    let touch;
    let i = -1;
    let clientX = 0;
    let clientY = 0;
    const n = touches.length;
    if (touches instanceof Touch) {
      clientX = touches.clientX;
      clientY = touches.clientY;
    } else if (Array.isArray(touches)) {
      while (++i < n) {
        touch = touches[i];
        clientX += touch.clientX;
        clientY += touch.clientY;
      }
    } else {
      while (++i < n) {
        touch = touches.item(i);
        clientX += touch.clientX;
        clientY += touch.clientY;
      }
    }
    return {
      clientX: clientX / n,
      clientY: clientY / n,
    };
  }

  function pointCentroid(points) {
    let point;
    let i = -1;
    let x = 0;
    let y = 0;
    const n = points.length;
    while (++i < n) {
      point = points[i];
      x += point[0];
      y += point[1];
    }
    return [
      x / n,
      y / n,
    ];
  }

  /**
   * Return the centroid of the list of touches in the chart coordinate system.
   * @param {Element} el The container element.
   * @param {TouchList|array<Touch>|Touch} touches The touches.
   * @param {boolean} invert If true, the touches are inverted to the data domain.
   */
  function touchPoint(el, touches, invert) {
    const point = invert
      ? getInverse(d3.clientPoint(el, touchCentroid(touches)))
      : d3.clientPoint(el, touchCentroid(touches));
    point.touches = touches;
    return point;
  }

  /**
   * Convert a TouchList into an array of Touch objects.
   * @param {TouchList} list The TouchList.
   */
  function toTouchArray(list) {
    let i = -1;
    const n = list.length;
    const arr = new Array(n);
    while (++i < n) {
      arr[i] = list.item(i);
    }
    return arr;
  }

  /**
   * Find the Touch objects matching the given identifiers.
   * @param {TouchList} list The TouchList.
   * @param {array<number>} ids The Touch identifiers.
   */
  function findTouchByIds(list, ids) {
    let touch;
    let i = -1;
    const n = list.length;
    const matches = [];
    const matchSet = new Set(ids);
    while (++i < n) {
      touch = list.item(i);
      if (matchSet.has(touch.identifier)) {
        matches.push(touch);
      }
    }
    return matches;
  }

  /**
   * Create a stream of touch events.
   * @param {Element} target The target element.
   * @param {string} event The touch event name.
   * @param {number} touchCount The number of touches required.
   */
  function touchStream(target, event, touchCount) {
    const { fromEvent } = rxjs;
    const { filter, map, tap } = rxjs.operators;
    let event$ = fromEvent(target, event);
    if (touchCount) {
      event$ = event$.pipe(
        filter(evt => (evt.type === 'touchend' || evt.type === 'touchcancel')
          ? evt.changedTouches.length === touchCount
          : evt.targetTouches.length === touchCount)
      );
    }
    return event$.pipe(
      tap(preventDefault),
      map(evt => (evt.type === 'touchend' || evt.type === 'touchcancel')
        ? toTouchArray(evt.changedTouches)
        : toTouchArray(evt.targetTouches))
    );
  }

  /**
   * A custom RxJS operator to filter a stream of touch events by IDs.
   * @param {array<number>} touchIds 
   */
  function filterTouches(touchIds) {
    const { filter, map } = rxjs.operators;
    return function filterTouches(source) {
      return source.pipe(
        map(evt => (evt.type === 'touchend' || evt.type === 'touchcancel')
          ? findTouchByIds(evt.changedTouches, touchIds)
          : findTouchByIds(evt.targetTouches, touchIds)),
        filter(touches => touches.length));
    };
  }

  /**
   * A custom RxJS operator that buffers events together during a specified interval following the initial event.
   * @param {number} interval The buffer interval.
   */
  function clusterTime(interval) {
    const { timer } = rxjs;
    const { bufferToggle, take, throttleTime } = rxjs.operators;
    return function clusterTime(source) {
      const openings = source.pipe(throttleTime(interval));
      return source.pipe(bufferToggle(openings, () => timer(interval).pipe(take(1))));
    };
  }

  /**
   * Call preventdefault() on an event.
   * @param {Event} evt The event.
   */
  function preventDefault(evt) {
    evt.preventDefault();
  }

  /**
   * Return the distance between two points.
   * @param {array<number>} pointA The first point.
   * @param {array<number>} pointB The second point.
   */
  function distanceTo(pointA, pointB) {
    const dx = pointB[0] - pointA[0];
    const dy = pointB[1] - pointA[1];
    return dx * dx + dy * dy;
  }

  /**
   * Find the closest point within a list of points.
   * @param {array<array<number>>} points The points to search.
   * @param {array<number>} point The source point.
   */
  function closestPoint(points, point) {
    let dist;
    let other;
    let best;
    let bestDist = Infinity;
    let i = -1;
    let n = points.length;
    while (++i < n) {
      other = points[i];
      dist = distanceTo(point, other);
      if (dist < bestDist) {
        best = other;
        bestDist = dist;
      }
    }
    if (best) {
      best.distance = Math.sqrt(bestDist);
      return best;
    }
    return null;
  }

  /**
   * Find the nearest point on the path. Adapted from https://gist.github.com/mbostock/8027637.
   * @param {SVGPathElement} pathEl The SVG path element.
   * @param {array<number>} point The source point.
   * @param {null|'x'|'y'} [restrict=null] If true, searching will be limited along the x axis.
   * @param {number} [precision=8] The precision at which to scan. Default is about 1px.
   
   */
  function closestPathPoint(pathEl, point, restrict = null, precision = 8) {
    if (!pathEl) return null;

    let best;
    let bestLength;
    let bestDistance = Infinity;
    const pathLength = pathEl.getTotalLength();

    function distanceTo(p) {
      const dx = restrict === 'y' ? 0 : p.x - point[0];
      const dy = restrict === 'x' ? 0 : p.y - point[1];
      return dx * dx + dy * dy;
    }

    // Approximate linear scan.
    for (let scan, scanLength = 0, scanDistance; scanLength <= pathLength; scanLength += precision) {
      scanDistance = distanceTo(scan = pathEl.getPointAtLength(scanLength));
      if (scanDistance < bestDistance) {
        best = scan;
        bestLength = scanLength;
        bestDistance = scanDistance;
      }
    }
    // Precise estimate from binary search.
    precision /= 2;
    while (precision > 0.5) {
      let before;
      let after;
      let beforeLength;
      let afterLength;
      let beforeDistance;
      let afterDistance;
      if (((beforeLength = bestLength - precision) >= 0
        && (beforeDistance = distanceTo(before = pathEl.getPointAtLength(beforeLength))) < bestDistance
      )) {
        best = before;
        bestLength = beforeLength;
        bestDistance = beforeDistance;
      } else if (((afterLength = bestLength + precision) <= pathLength
        && (afterDistance = distanceTo(after = pathEl.getPointAtLength(afterLength))) < bestDistance
      )) {
        best = after;
        bestLength = afterLength;
        bestDistance = afterDistance;
      } else {
        precision /= 2;
      }
    }
    best = [best.x, best.y];
    best.distance = Math.sqrt(bestDistance);
    return best;
  }

  /**
   * Return the most common data type in an array.
   * @param {array<*>} array The data array.
   * @param {function} valueAccessor A function to return the value for each datum in the array.
   * @param {number} limit The number of datum to consider.
   */
  function commonType(array, valueAccessor, limit) {
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
   * Convert a property descriptor for padding or margins into an object with numberical values. Supports percentages.
   * @param {object} props The properties object.
   * @param {number} width The chart width.
   * @param {number} height The chart height.
   */
  function toGeomProps(props, width, height) {
    const newProps = {};
    Object.keys(props).forEach(key => {
      const value = props[key];
      if (_.isString(value)) {
        const pct = parseFloat(value.split('%')[0]) / 100;
        switch (key) {
          case 'top':
          case 'bottom':
            newProps[key] = pct * height;
            break;
          case 'right':
          case 'left':
            newProps[key] = pct * width;
            break;
          default:
            break;
        }
      } else {
        newProps[key] = value;
      }
    });
    return newProps;
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
    let smallMultiple = DEFAULT_SMALL_MULTIPLE;
    let marginProps = Object.assign({}, DEFAULT_MARGIN_PROPS);
    let paddingProps = Object.assign({}, DEFAULT_PADDING_PROPS);
    let axisProps = Object.assign({}, DEFAULT_AXIS_PROPS);
    let xAccessor = DEFAULT_X_ACCESSOR;
    let yAccessor = DEFAULT_Y_ACCESSOR;
    let xDomain = DEFAULT_X_DOMAIN;
    let yDomain = DEFAULT_Y_DOMAIN;
    let seriesDomain = DEFAULT_SERIES_DOMAIN;
    let seriesScheme = DEFAULT_SERIES_SCHEME;
    let seriesKeyAccessor = DEFAULT_SERIES_KEY_ACCESSOR;
    let seriesDataAccessor = DEFAULT_SERIES_DATA_ACCESSOR;
    let matchAccessor = DEFAULT_MATCH_ACCESSOR;
    let curve = DEFAULT_CURVE;
    
    // Local variables are scoped to a DOM element; they are not shared between small multiple instances generated by
    // the same timeline object.
    const localId = d3.local();
    const localProps = d3.local();
    const localScales = d3.local();
    const localCurve = d3.local();
    const localPoints = d3.local();
    const localSketching = d3.local();
    const localZooming = d3.local();
    const localChanged = d3.local();

    const dispatch = d3.dispatch(
      'sketchStart',
      'sketch',
      'sketchEnd',
      'sketchSave',
      'pointMove',
      'pointChange',
      'zoomStart',
      'zoom',
      'zoomEnd',
      'change',
    );

    function timeline(svgSelection) {
      svgSelection.each(function(data) {
        // Calculate chart properties.
        const svg = d3.select(this);
        const props = getProps(svg);
        const scales = getScales(data, props);
        const axes = getAxes(scales);

        // Persist the props and scales locally.
        localProps.set(this, props);
        localScales.set(this, scales);

        // Set the chart and other properties that need initialization only once.
        if (localId.get(this) === undefined) {
          localId.set(this, _.uniqueId('timeline'));
        }
        if (localSketching.get(this) === undefined) {
          localSketching.set(this, false);
        }
        if (localZooming.get(this) === undefined) {
          localZooming.set(this, false);
        }
        if (localChanged.get(this) === undefined) {
          localChanged.set(this, false);
        }

        localCurve.set(this, getPoints(svg, data.sketch));
        localPoints.set(this, getPoints(svg, data.points));

        // Render the chart skeleton.
        renderChart(svg, props);
        renderAxes(svg, props, axes);

        // Render the chart content.
        renderSeries(svg, props, scales, data);
        renderSketch(svg, props, scales, data);
        renderPoints(svg, props, scales, data);
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
        margin: toGeomProps(marginProps, chartWidth, chartHeight),
        padding: toGeomProps(paddingProps, chartWidth, chartHeight),
      };
    }

    function getScales(data, props) {
      const xExtent = mergeExtent(data.series, seriesDataAccessor, xAccessor, xDomain);
      const yExtent = mergeExtent(data.series, seriesDataAccessor, yAccessor, yDomain);
      const keys = data.series.map(seriesKeyAccessor);
      const keyType = commonType(keys);
      const keyExtent = seriesDomain[0] === undefined || seriesDomain[1] === undefined
        ? keyType === 'number' ? d3.extent(keys) : domain(keys)
        : seriesDomain;
      if (seriesDomain[0] !== undefined) {
        keyExtent[0] = seriesDomain[0];
      }
      if (seriesDomain[1] !== undefined) {
        keyExtent[1] = seriesDomain[1];
      }
      const xRange = [props.padding.left, props.chartWidth - props.padding.right];
      const yRange = [props.chartHeight - props.padding.bottom, props.padding.top];  

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
     * Invert the given points into the data domain.
     * @param {object} svg The SVG selection
     * @param {array<array<number>>} points The points to invert
     */
    function getInverse(svgEl, points = []) {
      let point;
      const {
        x: xScale,
        y: yScale,
      } = localScales.get(svgEl);
      return points.map(p => {
        point = [xScale.invert(p[0]), yScale.invert(p[1])];
        point.type = p.type;
        point.touches = p.touches;
        return point;
      });
    }  

    /**
     * Convert the given data into the chart space.
     * @param {object} svg The SVG selection
     * @param {array<array<number>>} points The points to transform
     */
    function getPoints(svg, data = []) {
      let point;
      const {
        x: xScale,
        y: yScale,
      } = localScales.get(svg.node());
      return data.map(d => {
        point = [xScale(d[0]), yScale(d[1])];
        point.type = d.type;
        point.touches = d.touches;
        return point;
      });
    }

    /**
     * Render the chart skeleton, binding data to the appropriate content areas.
     * @param {object} svg The SVG selection
     * @param {object} props The chart properties
     */
    function renderChart(svg, props) {
      // Render the clipping path.
      const clipUrl = renderClipPath(svg, props);

      // Render the timeline series area. Clip.
      const seriesContainer = renderContainer(svg, props, 'series-content', clipUrl);

      // Render the sketch over other timelines but under events. Clip.
      const sketchContainer = renderContainer(svg, props, 'sketch-content', clipUrl);

      // Render the event container. Do not clip.
      const pointContainer = renderContainer(svg, props, 'point-content');

      // Render the touch overlay.
      const overlay = renderOverlay(svg);

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
        .merge(series)
          .attr('d', d => line(seriesDataAccessor(d)))
          .attr('opacity', d => data.sketch.length == 0 || matchAccessor(d) ? 1 : .1)
          .attr('stroke-width', d => data.sketch.length > 0 && matchAccessor(d) ? 2 : 1)
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
      const path = line(curve);

      let sketch = container
        .selectAll('.series.visible')
        .data([path]);
      sketch.exit().remove();
      sketch = sketch
        .enter()
        .append('path')
          .attr('class', 'series visible')
          .attr('fill', 'none')
          .attr('stroke', 'black')
          .attr('stroke-width', 2)
          .attr('stroke-linecap', 'butt')
          .attr('opacity', 1)
        .merge(sketch)
          .attr('d', d => d);
    }

    /**
     * Render the points on the curve.
     * @param {object} svg The SVG selection.
     */
    function renderPoints(svg) {
      const points = localPoints.get(svg.node());
      const container = svg.select('.point-content');
      
      let point = container
        .selectAll('.point')
        .data(points);
      point.exit().remove();
      point = point
        .enter()
        .append('circle')
          .attr('class', 'point')
        .merge(point)
          .attr('cx', d => d[0])
          .attr('cy', d => d[1])
          .attr('r', d => d.selected ? 30 : 6)
          .attr('stroke', d => d.type.stroke)
          .attr('stroke-width', 2)
          .attr('fill', d => d.type.fill);
    }

    /**
     * Render the overlay for touch events.
     * @param {object} svg The SVG selection
     */
    function renderOverlay(svg) {
      const svgEl = svg.node();
      const curve = localCurve.get(svgEl);
      const props = localProps.get(svgEl);
      const changed = localChanged.get(svgEl);
      let overlay = svg
        .selectAll('.touch-overlay')
        .data([0]);
      overlay = overlay
        .enter()
        .append('g')
          .attr('class', 'touch-overlay')
          .style('touch-action', 'none')
          .each(_.partial(initOverlayTouch, svg))
        .merge(overlay);
        
      let rect = overlay
        .selectAll('rect')
        .data([0]);
      rect = rect
        .enter()
        .append('rect')
          .style('touch-action', 'none')
        .merge(rect)
          .attr('width', props.width)
          .attr('height', props.height)
          .attr('opacity', 0.001);

      // TODO: Move this to another function?
      let boundary = overlay
        .selectAll('.bound')
        .data(curve.length ? [curve[0], curve[curve.length - 1]] : []);
      boundary.exit().remove();
      boundary = boundary
        .enter()
        .append('line')
          .attr('class', 'bound')
        .merge(boundary)
          .attr('x1', d => d[0] + props.margin.left)
          .attr('x2', d => d[0] + props.margin.left)
          .attr('y1', props.margin.top)
          .attr('y2', props.chartHeight + props.margin.top)
          .attr('stroke', 'gray')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', 4);

      // Render the save button.
      let saveBtn = d3.select('body')
        .selectAll('.btn.btn-save')
        .data(changed ? [getOffset(svgEl)] : []);
      saveBtn.exit().remove();
      saveBtn = saveBtn
        .enter()
        .append('button')
          .attr('class', 'btn btn-primary btn-save')
          .on('touchend', _.partial(onSaveClick, svg))
        .merge(saveBtn)
          .style('position', 'absolute')
          .style('top', d => `calc(${d.top + d.height}px - 5rem)`)
          .style('left', d => `calc(${d.left + d.width}px - 5rem)`)
          .text('Save');

      return overlay;
    }

    function renderMenus(svg) {
      const svgEl = svg.node();
      const menu = contextMenu();
      const points = localPoints.get(svgEl);
      svg
        .selectAll('.point')
        .filter(d => d.menu)
        .call(menu);
      menu
        .on('change', _.partial(onMenuChange, svg))
        .on('remove', _.partial(onMenuRemove, svg));

      // Add a global event listener that closes the menu.
      if (points.some(p => p.menu)) {
        window.addEventListener('touchstart', () => {
          points.forEach(p => p.menu = false);
          renderMenus(svg);
        });
      }
    }

    function initOverlayTouch(svg) {
      const svgEl = svg.node();
      const containerEl = svg.select('.sketch-content').node();
      const { empty, fromEvent, merge, timer } = rxjs;
      const {
        buffer,
        catchError,
        concatMap,
        filter,
        first,
        map,
        mergeMap,
        pairwise,
        share,
        startWith,
        takeUntil,
        tap,
      } = rxjs.operators;

      // In order to get the best precision, the overlay handles all touch events.
      // Single finger events:
      // 1. Taps
      //    - onPointDoubletap
      // 2. Presses
      //    - onCurvePress
      //    - onCurveMove
      //    - onCurveRelease
      //    - onPointPress
      //    - onPointRelease
      //    - onOtherPress
      //    - onOtherRelease
      // 3. Moves
      //    - onSketchStart
      //    - onSketch
      //    - onSketchEnd
      //    - onPointMove
      //    - onSketchMove

      // Single finger taps.
      const tap$ = touchStream(this, 'touchstart', 1).pipe(
        filter(() => !smallMultiple),
        concatMap(touches => {
          const initPoint = touchPoint(containerEl, touches);
          const touchIds = touches.map(t => t.identifier);
          // Emit events when a significant amount of movement has occured after the touch start.
          const touchdelta$ = fromEvent(this, 'touchmove').pipe(
            filterTouches(touchIds),
            map(touches => touchPoint(containerEl, touches)),
            map(point => distanceTo(point, initPoint)),
            filter(dist => dist > MOVE_DELTA)
          );
          // Emit events that end the touch.
          const touchend$ = merge(
            fromEvent(this, 'touchend'),
            fromEvent(this, 'touchcancel')
          ).pipe(filterTouches(touchIds));
          // Emit touch ending events that are not interrupted by movement or the timeout for a press.
          return touchend$.pipe(
            first(),
            takeUntil(touchdelta$),
            takeUntil(timer(PRESS_INTERVAL)),
            catchError(err => empty())
          );
        })
      );

      // onPointDoubletap.
      tap$.pipe(
        map(touches => touchPoint(containerEl, touches)),
        clusterTime(DOUBLE_TAP_INTERVAL),
        filter(group => group.length === 2),
        map(group => {
          const point = group[0];
          const points = localPoints.get(svgEl);
          return closestPoint(points, point);
        }),
        filter(closest => closest && closest.distance <= POINT_DISTANCE)
      ).subscribe(_.partial(onPointDoubletap, svg));

      // Presses.
      const press$ = fromEvent(this, 'touchstart').pipe(
        filter(() => !smallMultiple && !localZooming.get(svgEl)),
        tap(preventDefault),
        map(evt => toTouchArray(evt.changedTouches)),
        filter(touches => touches.length === 1),
        concatMap(touches => {
          const initPoint = touchPoint(containerEl, touches);
          const touchIds = touches.map(t => t.identifier);
          // Emit events when a significant amount of movement has occured after the touch start.
          const touchdelta$ = fromEvent(this, 'touchmove').pipe(
            filterTouches(touchIds),
            map(touches => touchPoint(containerEl, touches)),
            map(point => distanceTo(point, initPoint)),
            filter(dist => dist > MOVE_DELTA)
          );
          // Emit events that end the touch.
          const touchend$ = merge(
            fromEvent(this, 'touchend'),
            fromEvent(this, 'touchcancel')
          ).pipe(filterTouches(touchIds));
          // Emit an event after a timeout, unless it is a pinch event, interrupted by movement, or interrupted by an
          // event ending the touch.
          return timer(PRESS_INTERVAL).pipe(
            takeUntil(pinch$), // TODO: Why is this not working?
            takeUntil(touchdelta$),
            takeUntil(touchend$),
            filter(() => !localZooming.get(svgEl)),
            map(() => touchPoint(containerEl, touches)),
            catchError(err => empty())
          );
        }),
        share(),
      );

      // Search for the closest object pressed and split by object type.
      const picked$ = press$.pipe(
        map(point => {
          let closest;
          const points = localPoints.get(svgEl);
          closest = closestPoint(points, point);
          if (closest && closest.distance <= POINT_DISTANCE) {
            closest._type = 'point';
            closest.touches = point.touches;
            return closest;
          }
          const sketchEl = svg.select('.series.visible').node();
          closest = closestPathPoint(sketchEl, point);
          if (closest && closest.distance <= CURVE_DISTANCE) {
            closest._type = 'curve';
            closest.touches = point.touches;
            return closest;
          }
          point._type = 'other';
          return point;
        }),
        share()
      );
      pointPress$ = picked$.pipe(
        filter(p => p._type === 'point'),
        tap(p => delete p._type),
        share()
      );
      curvePress$ = picked$.pipe(
        filter(p => p._type === 'curve'),
        tap(p => delete p._type),
        share()
      );
      otherPress$ = picked$.pipe(
        filter(p => p._type === 'other'),
        tap(p => delete p._type),
        share()
      );

      pointPress$.subscribe(_.partial(onPointPress, svg));
      curvePress$.subscribe(closest => onCurvePress(svg, closest, false));
      otherPress$.subscribe(_.partial(onOtherPress, svg));

      // onPointMove
      pointPress$.pipe(
        mergeMap(point => {
          const touchIds = point.touches.map(t => t.identifier);
          const touchmove$ = fromEvent(this, 'touchmove')
            .pipe(filterTouches(touchIds));
          const touchend$ = merge(
            fromEvent(this, 'touchend'),
            fromEvent(this, 'touchcancel')
          ).pipe(filterTouches(touchIds));
          return touchmove$.pipe(
            takeUntil(touchend$),
            map(touches => [point, touchPoint(containerEl, touches)]),
            filter(([oldPoint, newPoint]) => distanceTo(oldPoint, newPoint) > MOVE_DELTA),
            catchError(err => empty())
          );
        })
      ).subscribe(([oldPoint, newPoint]) => onPointMove(svg, oldPoint, newPoint));

      // onPointRelease
      pointPress$.pipe(
        mergeMap(point => {
          const touchIds = point.touches.map(t => t.identifier);
          return merge(
            fromEvent(this, 'touchend'),
            fromEvent(this, 'touchcancel')
          ).pipe(
            filterTouches(touchIds),
            first(),
            map(() => point),
            catchError(err => empty())
          );
        })
      ).subscribe(_.partial(onPointRelease, svg));

      // onCurveMove
      curvePress$.pipe(
        mergeMap(point => {
          const touchIds = point.touches.map(t => t.identifier);
          const touchmove$ = fromEvent(this, 'touchmove')
            .pipe(filterTouches(touchIds));
          const touchend$ = merge(
            fromEvent(this, 'touchend'),
            fromEvent(this, 'touchcancel')
          ).pipe(filterTouches(touchIds));
          return touchmove$.pipe(
            takeUntil(touchend$),
            map(touches => [point, touchPoint(containerEl, touches)]),
            filter(([oldPoint, newPoint]) => distanceTo(oldPoint, newPoint) > MOVE_DELTA),
            catchError(err => empty())
          );
        })
      ).subscribe(([oldPoint, newPoint]) => onCurveMove(svg, oldPoint, newPoint));

      // onCurveRelease
      curvePress$.pipe(
        mergeMap(point => {
          const touchIds = point.touches.map(t => t.identifier);
          return merge(
            fromEvent(this, 'touchend'),
            fromEvent(this, 'touchcancel')
          ).pipe(
            filterTouches(touchIds),
            first(),
            map(() => point),
            catchError(err => empty())
          );
        })
      ).subscribe(_.partial(onCurveRelease, svg));

      // onOtherRelease
      otherPress$.pipe(
        mergeMap(point => {
          const touchIds = point.touches.map(t => t.identifier);
          return merge(
            fromEvent(this, 'touchend'),
            fromEvent(this, 'touchcancel')
          ).pipe(
            filterTouches(touchIds),
            first(),
            map(() => point),
            catchError(err => empty())
          );
        })
      ).subscribe(_.partial(onOtherRelease, svg));

      // Sketch start events.
      const sketch$ = fromEvent(this, 'touchstart').pipe(
        filter(() => !smallMultiple && !localZooming.get(svgEl)),
        tap(preventDefault),
        map(evt => toTouchArray(evt.changedTouches)),
        filter((touches) => {
          const selected = localPoints.get(svgEl).filter(d => d.selected);
          return touches.length === 1 || selected.length === 1;
        }),
        concatMap(touches => {
          const initPoint = touchPoint(containerEl, touches);
          const touchIds = touches.map(t => t.identifier);
          const touchmove$ = fromEvent(this, 'touchmove')
            .pipe(filterTouches(touchIds), share());
          // Emit events when a significant amount of movement has occured after the touch start.
          const touchdelta$ = touchmove$.pipe(
            map(touches => touchPoint(containerEl, touches)),
            map(point => distanceTo(point, initPoint)),
            filter(dist => dist > MOVE_DELTA)
          );
          // Emit events that end the touch.
          const touchend$ = merge(
            fromEvent(this, 'touchend'),
            fromEvent(this, 'touchcancel')
          ).pipe(filterTouches(touchIds));
          // Buffer touch movement until significant movement occurs uninterrupted by a pinch event, an event ending
          // the touch, or by the timer for a press. Release the buffer as a cluster of touches to start the sketch.
          return touchmove$.pipe(
            takeUntil(pinch$), // TODO: Not working?
            takeUntil(touchend$),
            takeUntil(timer(PRESS_INTERVAL)),
            filter(() => !localZooming.get(svgEl)),
            buffer(touchdelta$),
            first(),
            map(head => head.length === 0 ? [touches] : head),
            catchError(err => empty())
          );
        }),
        share()
      );

      // onSketchStart and onSketch events.
      sketch$.pipe(
        tap(_.partial(onSketchStart, svg)),
        concatMap(head => {
          const touchIds = head[0].map(t => t.identifier);
          const touchmove$ = fromEvent(this, 'touchmove')
            .pipe(filterTouches(touchIds));
          const touchend$ = merge(
            fromEvent(this, 'touchend'),
            fromEvent(this, 'touchcancel')
          ).pipe(filterTouches(touchIds));
          return touchmove$.pipe(
            takeUntil(touchend$),
            catchError(err => empty())
          );
        })
      ).subscribe(_.partial(onSketch, svg));

      // onSketchEnd events.
      sketch$.pipe(
        concatMap(head => {
          const touchIds = head[0].map(t => t.identifier);
          return merge(
            fromEvent(this, 'touchend'),
            fromEvent(this, 'touchcancel')
          ).pipe(
            filterTouches(touchIds),
            first(),
            catchError(err => empty())
          );
        })
      ).subscribe(_.partial(onSketchEnd, svg));

      // Pinch. A pinch is two touches within quick succession.
      const pinch$ = fromEvent(this, 'touchstart').pipe(
        filter(() => !smallMultiple && !localSketching.get(svgEl)),
        tap(preventDefault),
        map(evt => toTouchArray(evt.changedTouches)),
        clusterTime(PINCH_BUFFER),
        map(touches => _.uniqBy(_.flatten(touches), t => t.identifier)),
        filter(touches => touches.length === 2),
        share()
      );

      // onZoomStart and onZoom events.
      pinch$.pipe(
        tap(_.partial(onZoomStart, svg)),
        concatMap(touches => {
          const touchIds = touches.map(t => t.identifier);
          const touchmove$ = fromEvent(this, 'touchmove')
            .pipe(filterTouches(touchIds));
          const touchend$ = merge(
            fromEvent(this, 'touchend'),
            fromEvent(this, 'touchcancel')
          ).pipe(filterTouches(touchIds));
          return touchmove$.pipe(
            startWith(touches),
            takeUntil(touchend$),
            catchError(err => empty()),
            map(touches => touches.map(t => touchPoint(containerEl, [t]))),
            pairwise(),
          );
        })
      ).subscribe(([prevPoints, nextPoints]) => onZoom(svg, prevPoints, nextPoints));

      // onZoomEnd events.
      pinch$.pipe(
        concatMap(touches => {
          const touchIds = touches.map(t => t.identifier);
          return merge(
            fromEvent(this, 'touchend'),
            fromEvent(this, 'touchcancel')
          ).pipe(
            filterTouches(touchIds),
            first(),
            catchError(err => empty())
          );
        })
      ).subscribe(_.partial(onZoomEnd, svg));
    }

    function onSketchStart(svg, head) {
      const svgEl = svg.node();
      const containerEl = svg.select('.sketch-content').node();
      const selected = localPoints.get(svgEl).filter(d => d.selected);
      const start = head.map(touches => touchPoint(containerEl, touches));
      let curve = [];
      let points = [];
      if (selected.length === 1) {
        // Anchor and resketch.
        const anchor = selected[0];
        const oldCurve = localCurve.get(svgEl);
        const oldPoints = localPoints.get(svgEl);
        if (head[0][0] < anchor) {
          // TODO: Fix this case.
          const pointA = anchor;
          const pointB = oldCurve[oldCurve.length - 1];
          curve = sliceBetween(oldCurve, pointA, pointB)[1];
          points = sliceBetween(oldPoints, pointA, pointB)[1];
        } else {
          const pointA = oldCurve[0];
          const pointB = anchor;
          curve = sliceBetween(oldCurve, pointA, pointB)[1];
          points = sliceBetween(oldPoints, pointA, pointB)[1];
        }
      }

      curve = curve.concat(start);
      localCurve.set(svgEl, curve);
      localPoints.set(svgEl, points);
      localSketching.set(svgEl, true);
      localChanged.set(svgEl, true);
      renderSketch(svg);
      renderOverlay(svg);
      renderPoints(svg);

      const curveInverse = getInverse(svgEl, curve);
      const pointsInverse = getInverse(svgEl, points);
      dispatch.call('sketchStart', svgEl, curveInverse, pointsInverse);
    }

    function onSketch(svg, touches) {
      const svgEl = svg.node();
      const containerEl = svg.select('.sketch-content').node();
      if (localSketching.get(svgEl)) {
        const point = touchPoint(containerEl, touches);
        const curve = localCurve.get(svgEl);
        const points = localPoints.get(svgEl);
        curve.push(point);
        renderSketch(svg);
        renderOverlay(svg);

        // const curveInverse = getInverse(svgEl, curve);
        // const pointsInverse = getInverse(svgEl, points);
        // dispatch.call('sketch', svgEl, curveInverse, pointsInverse);
      }
    }

    function onSketchEnd(svg, touches) {
      const svgEl = svg.node();
      const curve = localCurve.get(svgEl);
      const points = localPoints.get(svgEl);
      localSketching.set(svgEl, false);
      // TODO: Post-processing of curve?
      renderOverlay(svg);

      const curveInverse = getInverse(svgEl, curve);
      const pointsInverse = getInverse(svgEl, points);
      dispatch.call('sketchEnd', svgEl, curveInverse, pointsInverse);
      dispatch.call('change', svgEl, curveInverse, pointsInverse);
    }

    function onSaveClick(svg) {
      const svgEl = svg.node();
      const curve = localCurve.get(svgEl);
      const points = localPoints.get(svgEl);
      localChanged.set(svgEl, false);
      setTimeout(() => { renderOverlay(svg); }, 250);

      const curveInverse = getInverse(svgEl, curve);
      const pointsInverse = getInverse(svgEl, points);
      dispatch.call('sketchSave', svgEl, curveInverse, pointsInverse);
    }

    function onCurvePress(svg, point) {
      const svgEl = svg.node();
      const points = localPoints.get(svgEl);
      // Insert a new point in the selected state.
      const idx = _.sortedIndexBy(points, point, d => d[0]);
      points.splice(idx, 0, point);
      point.type = DEFAULT_TYPE;
      point.selected = true;
      localChanged.set(svgEl, true);
      renderPoints(svg);
      renderOverlay(svg);
    }

    function onCurveMove(svg, point, touchPoint) {
      onPointMove(svg, point, touchPoint);
    }

    function onCurveRelease(svg, point) {
      onPointRelease(svg, point);
    }

    function onPointPress(svg, point) {
      // Select the point.
      point.selected = true;
      renderPoints(svg);
    }

    function onPointMove(svg, point, touchPoint) {
      const svgEl = svg.node();
      const points = localPoints.get(svgEl);
      const selected = points.filter(d => d.selected);

      if (selected.length === 2) {
        // Stretch/trunctate
        const curve = localCurve.get(svgEl);
        const anchor = selected.reduce((a, p) => p !== point ? p : a, [0, 0]);
        const oldDist = point[0] - anchor[0];
        const newDist = touchPoint[0] - anchor[0];
        const scale = newDist / oldDist;
        const diff = newDist - oldDist;

        // Scale x axis around the anchor.
        let [before, between, after] = sliceBetween(curve, anchor, point);
        scalePoints(between, scale, 1, anchor);
        // Translate points on the other side of the moved point.
        if (point[0] <= anchor[0]) {
          before.forEach(p => { p[0] += diff; });
        } else if (point[0] >= anchor[0]) {
          after.forEach(p => { p[0] += diff; });
        }
        ([before, between, after] = sliceBetween(points, anchor, point));
        scalePoints(between, scale, 1, anchor);
        if (point[0] <= anchor[0]) {
          before.forEach(p => { p[0] += diff; });
        } else if (point[0] >= anchor[0]) {
          after.forEach(p => { p[0] += diff; });
        }
        renderSketch(svg);
        renderPoints(svg);
        renderOverlay(svg);
      } else {
        // Move the point by finding the closest point on the curve, restricting to the x axis.
        const sketchEl = svg.select('.series.visible').node();
        const closest = closestPathPoint(sketchEl, touchPoint, 'x');
        point[0] = closest[0];
        point[1] = closest[1];
        renderPoints(svg);
      }

      // const curveInverse = getInverse(svgEl, curve);
      // const pointsInverse = getInverse(svgEl, points);
      // dispatch.call('pointMove', svgEl, curveInverse, pointsInverse);
    }

    function onPointRelease(svg, point) {
      // Deselect the point and re-index its position. It may have changed due to movement.
      const svgEl = svg.node();
      const curve = localCurve.get(svgEl);
      const points = localPoints.get(svgEl);
      _.pull(points, point);
      const idx = _.sortedIndexBy(points, point, d => d[0]);
      points.splice(idx, 0, point);
      point.selected = false;
      localChanged.set(svgEl, true);
      renderPoints(svg);
      renderOverlay(svg);

      const curveInverse = getInverse(svgEl, curve);
      const pointsInverse = getInverse(svgEl, points);
      dispatch.call('pointChange', svgEl, curveInverse, pointsInverse);
      dispatch.call('change', svgEl, curveInverse, pointsInverse);
    }

    function onPointDoubletap(svg, point) {
      point.menu = true;
      renderMenus(svg);
    }

    function onOtherPress(svg, point) {
      // Clear existing control points.
      const svgEl = svg.node();
      const curve = localCurve.get(svgEl);
      const points = localPoints.get(svgEl);
      localPoints.set(svgEl, points.filter(d => !!d.type.value));
      localChanged.set(svgEl, true);
      renderPoints(svg);
      renderMenus(svg);
      renderOverlay(svg);

      const curveInverse = getInverse(svgEl, curve);
      const pointsInverse = getInverse(svgEl, points);
      dispatch.call('change', svgEl, curveInverse, pointsInverse);
    }

    function onOtherRelease(svg, point) {
    }

    function onZoomStart(svg, head) {
      const svgEl = svg.node();
      const curve = localCurve.get(svgEl);
      const points = localPoints.get(svgEl);
      localZooming.set(svgEl, true);

      const curveInverse = getInverse(svgEl, curve);
      const pointsInverse = getInverse(svgEl, points);
      dispatch.call('zoomStart', svgEl, curveInverse, pointsInverse);
    }

    function onZoom(svg, prevPoints, nextPoints) {
      const svgEl = svg.node();
      const curve = localCurve.get(svgEl);
      const points = localPoints.get(svgEl);
      if (curve && localZooming.get(svgEl)) {
        // Determine the scale.
        const prevDist = distanceTo(prevPoints[0], prevPoints[1]);
        const nextDist = distanceTo(nextPoints[0], nextPoints[1]);
        const anchor = pointCentroid(nextPoints);
        const scale = Math.sqrt(nextDist / prevDist);

        scalePoints(points, scale, scale, anchor);
        scalePoints(curve, scale, scale, anchor);
        renderSketch(svg);
        renderPoints(svg);
        renderOverlay(svg);

        // const curveInverse = getInverse(svgEl, curve);
        // const pointsInverse = getInverse(svgEl, points);
        // dispatch.call('zoom', svgEl, curveInverse, pointsInverse);
      }
    }

    function onZoomEnd(svg) {
      const svgEl = svg.node();
      const curve = localCurve.get(svgEl);
      const points = localPoints.get(svgEl);
      localZooming.set(svgEl, false);
      localChanged.set(svgEl, true);
      renderOverlay(svg);

      const curveInverse = getInverse(svgEl, curve);
      const pointsInverse = getInverse(svgEl, points);
      dispatch.call('zoomEnd', svgEl, curveInverse, pointsInverse);
      dispatch.call('change', svgEl, curveInverse, pointsInverse);
    }

    function onMenuChange(svg, point, option) {
      const svgEl = svg.node();
      const curve = localCurve.get(svgEl);
      const points = localPoints.get(svgEl);
      point.type = option;
      point.menu = false;
      localChanged.set(svgEl, true);
      renderPoints(svg);
      renderOverlay(svg);
      // Adding a slight delay gives feedback that the menu option was pressed.
      setTimeout(() => { renderMenus(svg); }, 250);

      const curveInverse = getInverse(svgEl, curve);
      const pointsInverse = getInverse(svgEl, points);
      dispatch.call('pointChange', svgEl, curveInverse, pointsInverse);      
      dispatch.call('change', svgEl, curveInverse, pointsInverse);
    }

    function onMenuRemove(svg, point) {
      const svgEl = svg.node();
      const curve = localCurve.get(svgEl);
      const points = localPoints.get(svgEl);
      _.pull(points, point);
      localChanged.set(svgEl, true);
      renderPoints(svg);
      renderOverlay(svg);
      setTimeout(() => { renderMenus(svg); }, 250);

      const curveInverse = getInverse(svgEl, curve);
      const pointsInverse = getInverse(svgEl, points);
      dispatch.call('pointChange', svgEl, curveInverse, pointsInverse);
      dispatch.call('change', svgEl, curveInverse, pointsInverse);
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
     * If p is specified, set the padding object and return this timeline. Otherwise, return the current padding.
     * @param {object|null|undefined} p The padding object. If null, the padding is set to its default values, which
     * are { top: 0, right: 0, bottom: 0, left: 0 }.
     */
    timeline.padding = function (p) {
      if (p === null) {
        paddingProps = Object.assign({}, DEFAULT_PADDING_PROPS);
        return timeline;
      } else if (_.isNumber(p) || _.isString(p)) {
        paddingProps = {
          top: p,
          right: p,
          bottom: p,
          left: p,
        };
        return timeline;
      } else if (typeof p === 'object') {
        paddingProps = Object.assign({}, DEFAULT_PADDING_PROPS, p);
        return timeline;
      }
      return paddingProps;
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
     * @param {array<number>|undefined} x The x domain. Values set to undefined will be calculated dynamically. If null,
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
     * @param {array<number>|undefined} y The y domain. Values set to undefined will be calculated dynamically. If null,
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
     * If s is specified, set the series domain to the given [min, max] extent and return this timeline. Otherwise,
     * return the current series domain.
     * @param {array<number>|undefined} s The series domain. Values set to undefined will be calculated dynamically.
     * If null, the color domain is set to its default value, which is [undefined, undefined].
     */
    timeline.seriesDomain = function(s) {
      if (s === null) {
        seriesDomain = DEFAULT_SERIES_DOMAIN;
        return timeline;
      } else if (s !== undefined) {
        seriesDomain = s;
        return timeline;
      }
      return seriesDomain.slice(0);
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
     * If d is specified, set the small multiple flag and return this timeline. Otherwise, return the current small multiple state.
     * @param {function|null|undefined} c The small multiple state. If null, the small multiple state is set to its default value,
     * which is false.
     */
    timeline.smallMultiple = function(d) {
      if (d === null) {
        smallMultiple = DEFAULT_SMALL_MULTIPLE;
        return timeline;
      } else if (d !== undefined) {
        smallMultiple = d;
        return timeline;
      }
      return smallMultiple;
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

})(window, window.d3, window._, window.contextMenu, window.vector);