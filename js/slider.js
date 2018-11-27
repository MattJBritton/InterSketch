(function(global, d3, _) {
  const DEFAULT_MIN = 0;
  const DEFAULT_MAX = 10;
  const DEFAULT_STEP = "any";
  const DEFAULT_START_VALUE = 5;
  const DEFAULT_LABEL_TEXT = '';
  const DEFAULT_DISABLED = () => false;
  const DEFAULT_TICKS = [
    { value: 0, label: "" },
    { value: 10, label: "" },
  ];

  global.slider = function() {
    let min = DEFAULT_MIN;
    let max = DEFAULT_MAX;
    let step = DEFAULT_STEP;
    let startValue = DEFAULT_START_VALUE;
    let labelText = DEFAULT_LABEL_TEXT;
    let disabled = DEFAULT_DISABLED;
    let ticks = DEFAULT_TICKS;
    
    const localId = d3.local();
    const dispatch = d3.dispatch('change');

    const slider = function(selection) {
      selection.each(function(d, i) {
        if (localId.get(this) === undefined) {
          localId.set(this, _.uniqueId('slider'));
        }
        const id = localId.get(this);
        const group = d3.select(this);
        let label = group
          .selectAll('label')
          .data([0]);
        label.exit().remove();
        label = label
          .enter()
          .append('label')
            .attr('for', `${id}-toggle`)
          .merge(label)
            .text(labelText);
        
        let tickContainer = group
          .selectAll('.tick-container')
          .data([0]);
        tickContainer.exit().remove();
        tickContainer = tickContainer
          .enter()
          .append('div')
            .attr('class', 'tick-container')
            .style('position', 'relative')
          .merge(tickContainer);
        let tick = tickContainer
          .selectAll('.tick')
          .data(ticks);
        tick = tick
          .enter()
          .append('span')
            .attr('class', 'tick')
          .merge(tick)
            .style('position', (d, i) => i === 0 ? '' : 'absolute')
            .style('left', (d, i) => i === 0 ? 0 : '')
            .style('right', (d, i) => i === 0 ? '' : 0)
            .text(d => d.label);

        let input = group
          .selectAll('input')
          .data([0]);
        input.exit().remove();
        input = input
          .enter()
          .append('input')
            .attr('id', `${id}-toggle`)
            .attr('type', 'range')
            .attr('class', 'form-control-range')
            .attr('list', `${id}-ticks`)
            .on('change', () => {
              dispatch.call('change', this, d3.event.target.valueAsNumber);
            })
          .merge(input)
            .property('disabled', disabled)
            .attr('min', min)
            .attr('max', max)
            .attr('step', step)
            .attr('value', startValue);
        let datalist = group
          .selectAll('datalist')
          .data([ticks]);
        datalist.exit().remove();
        datalist = datalist
          .enter()
          .append('datalist')
            .attr('id', `${id}-ticks`)
          .merge(datalist);
        let option = datalist
          .selectAll('option')
          .data(d => d);
        option.exit().remove();
        option = option
          .enter()
          .append('option')
          .merge(option)
            .attr('value', d => d.value)
            .attr('label', d => d.label);
      });
    };

    slider.min = function (m) {
      if (m === null) {
        min = DEFAULT_MIN;
        return slider;
      } else if (m !== undefined) {
        min = m;
        return slider;
      }
      return min;
    };

    slider.max = function(m) {
      if (m === null) {
        max = DEFAULT_MAX;
        return slider;
      } else if (m !== undefined) {
        max = m;
        return slider;
      }
      return max;
    };

    slider.step = function(s) {
      if (s === null) {
        step = DEFAULT_STEP;
        return slider;
      } else if (s !== undefined) {
        step = s;
        return slider;
      }
      return step;
    };

    slider.startValue = function(v) {
      if (v === null) {
        startValue = DEFAULT_START_VALUE;
        return slider;
      } else if (v !== undefined) {
        startValue = v;
        return slider;
      }
      return startValue;
    };

    slider.label = function(t) {
      if (t === null) {
        labelText = DEFAULT_LABEL_TEXT;
        return slider;
      } else if (t !== undefined) {
        labelText = t;
        return slider;
      }
      return labelText;
    };

    slider.disabled = function(d) {
      if (d === null) {
        disabled = DEFAULT_DISABLED;
        return slider;
      } else if (d !== undefined) {
        disabled = d;
        return slider;
      }
      return disabled;
    };

    slider.ticks = function(t) {
      if (t === null) {
        ticks = DEFAULT_TICKS;
        return slider;
      } else if (t !== undefined) {
        ticks = t;
        return slider;
      }
      return ticks;
    };

    /**
     * Add, remove, or get the callback for the specified event types. See d3-dispatch.on.
     */
    slider.on = function () {
      const value = dispatch.on.apply(dispatch, arguments);
      return value === dispatch ? slider : value;
    };

    return slider;
  }
})(window, window.d3, window._);