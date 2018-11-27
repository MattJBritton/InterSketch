(function(global) {
  global.TYPE_OPTIONS = [
    { fill: 'transparent', stroke: 'black', label: 'None', value: undefined },
    { fill: '#66c2a5', stroke: 'transparent', label: 'Meal', value: 'meal' },
    { fill: '#fc8d62', stroke: 'transparent', label: 'Snack', value: 'snack' },
    { fill: '#8da0cb', stroke: 'transparent', label: 'Carbs Only', value: 'carb_correction' },
    { fill: '#e78ac3', stroke: 'transparent', label: 'Insulin Only', value: 'insulin_correction' },
  ];
  global.ACTION_OPTIONS = [
    { icon: 'far fa-times-circle', label: 'Remove', event: 'remove' },
  ];
})(window);