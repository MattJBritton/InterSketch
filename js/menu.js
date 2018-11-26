(function(global, d3, $, _) {
  const TYPE_OPTIONS = [
    { fill: 'transparent', stroke: 'black', label: 'None', 
      value: undefined },
    { fill: 'black', stroke: 'transparent', label: 'Meal', value: 'meal' },
    { fill: 'blue', stroke: 'transparent', label: 'Snack', value: 'snack' },
    { fill: 'red', stroke: 'transparent', label: 'Carbs Only', 
      value: 'carb_correction'},
    { fill: 'green', stroke: 'transparent', label: 'Insulin Only', 
      value: 'insulin_correction'}
  ];
  const ACTION_OPTIONS = [
    { icon: 'far fa-times-circle', label: 'Remove', event: 'remove' },
  ];

  global.contextMenu = function() {
    const dispatch = d3.dispatch(
      'change',
      'remove',
    );

    function contextMenu(pointSelection) {
      const data = pointSelection.data();
      const refs = pointSelection.nodes().map(el => ({
        getBoundingClientRect: el.getBoundingClientRect.bind(el),
        get clientWidth() {
          return el.getBoundingClientRect().clientWidth + 10;
        },
        get clientHeight() {
          return el.getBoundingClientRect().clientHeight + 10;
        }}));

      renderMenu(data, refs);
    }

    function renderMenu(data, refs) {
      let menu = d3.select('body')
        .selectAll('.dropdown-menu')
        .data(data);
      menu.exit().remove();
      menu = menu
        .enter()
        .append('div')
          .attr('class', 'dropdown-menu show')
        .merge(menu)
          .each(function(point) {
            // Render options fo
            const menu = d3.select(this);
            let item = menu
              .selectAll('.dropdown-item.type-item')
              .data(TYPE_OPTIONS);
            item.exit().remove();
            item = item
              .enter()
              .append('button')
                .attr('class', 'dropdown-item type-item')
                .on('click', onTypeClick.bind(this, point))
              .merge(item)
                .classed('active', d => d.value === point.type.value)
                .html((d) => {
                  return (
                    `<span class="color-dot" style="border: 2px solid ${d.stroke}; background-color: ${d.fill}"></span>`+
                    `<span>${d.label}</span>`
                  );
                });
            item = menu
              .selectAll('.dropdown-item.action-item')
              .data(ACTION_OPTIONS);
            item.exit().remove();
            item = item
              .enter()
              .append('button')
                .attr('class', 'dropdown-item action-item')
                .on('click', onActionClick.bind(this, point))
              .merge(item)
                .html((d) => {
                  return (
                    `<i class="${d.icon}"></i>`+
                    `<span>${d.label}</span>`
                  );
                });
          });

      function onTypeClick(point, option) {
        if (option.value !== point.type) {
          dispatch.call('change', this, point, option);
        }
      }

      function onActionClick(point, option) {
        dispatch.call(option.event, this, point);
      }

      // Position the menu with popper.js
      menu.each(function (d, i) {
        new Popper(refs[i], this, {
          placement: 'right',
        });
      });
    }

    /**
     * Add, remove, or get the callback for the specified event types. See d3-dispatch.on.
     */
    contextMenu.on = function() {
      const value = dispatch.on.apply(dispatch, arguments);
      return value === dispatch ? contextMenu : value;
    };


    return contextMenu;
  }

})(window, window.d3, window.$, window._);