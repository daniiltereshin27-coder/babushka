export const cities = [
  {name:'Москва',lat:55.7558,lng:37.6173},
  {name:'Стамбул',lat:41.0082,lng:28.9784},
  {name:'Дубай',lat:25.2048,lng:55.2708},
  {name:'Бангкок',lat:13.7563,lng:100.5018},
  {name:'Варшава',lat:52.2297,lng:21.0122},
  {name:'Буэнос-Айрес',lat:-34.6037,lng:-58.3816},
  {name:'Тбилиси',lat:41.7151,lng:44.8271},
  {name:'Алматы',lat:43.2220,lng:76.8512}
];

export const arcs = [
  ...cities.slice(1).map(city => ['Москва',city.name]),
  ['Стамбул','Дубай'], ['Дубай','Бангкок'], ['Варшава','Стамбул']
].map(([start,end],order) => {
  const a = cities.find(city => city.name === start);
  const b = cities.find(city => city.name === end);
  const rad = Math.PI/180;
  const cosine = Math.sin(a.lat*rad)*Math.sin(b.lat*rad)
    + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.cos((a.lng-b.lng)*rad);
  return {order,start,end,alt:Math.min(.4, .1 + Math.acos(Math.max(-1,Math.min(1,cosine)))*.12)};
});
