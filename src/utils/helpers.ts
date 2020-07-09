import { Vector as VectorLayer } from 'ol/layer';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import { Style, Fill } from 'ol/style';
import { Frame, GeoJSON } from '../types';

const percentageToHsl = (percentage: number) => {
  const hue = percentage * -120 + 120;
  return 'hsla(' + hue + ', 100%, 50%, 0.3)';
};

const createPolygon = (coordinates: number[][][], value: string, color: string) => {
  const polygonFeature = new Feature({
    type: 'Polygon',
    geometry: new Polygon(coordinates).transform('EPSG:4326', 'EPSG:3857'),
  });
  polygonFeature.set('value', value);
  polygonFeature.set('color', color);
  polygonFeature.setStyle(
    new Style({
      fill: new Fill({
        color: color,
      }),
    })
  );
  return polygonFeature;
};

export const createHeatLayer = (series: Frame[], geojson: GeoJSON) => {
  const stores: string[] = [];
  const assignValueToStore: { [key: string]: number } = {};
  const assignValueToStoreLog: { [key: string]: number } = {};
  // const assignValueToStoreCurrentFloor: { [key: string]: number } = {};
  // const assignPolygonToStore: { [key: string]: number[][][] } = {};

  series.map(item => {
    const sumValue = item.fields[0].values.buffer.reduce((sum, elm) => sum + elm, 0);
    if (item.name) {
      stores.push(item.name);
      assignValueToStore[item.name] = sumValue;
      assignValueToStoreLog[item.name] = Math.log2(sumValue);
    }
  });

  const heatValues = Object.values(assignValueToStoreLog);
  const max = Math.max(...heatValues);
  const min = Math.min(...heatValues);
  const range = max - min;

  const polygons: Feature[] = [];

  geojson.features.map(feature => {
    if (feature.properties && feature.properties.name && stores.includes(feature.properties.name)) {
      const percentage = (assignValueToStoreLog[feature.properties.name] - min) / range;
      polygons.push(
        createPolygon(
          feature.geometry.coordinates,
          assignValueToStore[feature.properties.name].toString(),
          percentageToHsl(percentage)
        )
      );
    }
  });

  // series.map(item => {
  //   const sumValue = item.fields[0].values.buffer.reduce((sum, elm) => sum + elm, 0);
  //   if (item.name) {
  //     stores.push(item.name);
  //     assignValueToStore[item.name] = sumValue;
  //   }
  // });

  // geojson.features.map(feature => {
  //   if (feature.properties && feature.properties.name && stores.includes(feature.properties.name)) {
  //     assignValueToStoreCurrentFloor[feature.properties.name] = assignValueToStore[feature.properties.name];
  //     assignPolygonToStore[feature.properties.name] = feature.geometry.coordinates;
  //   }
  // });

  // const heatValues = Object.values(assignValueToStoreCurrentFloor);

  // const max = Math.max(...heatValues);
  // const min = Math.min(...heatValues);
  // const range = max - min;

  // const polygons: Feature[] = [];

  // Object.keys(assignValueToStoreCurrentFloor).map(storeName => {
  //   const percentage = (assignValueToStoreCurrentFloor[storeName] - min) / range;
  //   polygons.push(
  //     createPolygon(
  //       assignPolygonToStore[storeName],
  //       assignValueToStoreCurrentFloor[storeName],
  //       percentageToHsl(percentage)
  //     )
  //   );
  // });

  return new VectorLayer({
    source: new VectorSource({
      features: polygons,
    }),
    zIndex: 2,
  });
};

export const processTransitionData = (data: any[]) => {
  const excludeArr = ['_id', '_index', '_type', 'Source', 'timestamp'];
  const startObj: { [key: string]: { [key: string]: number } } = {};
  const destObj: { [key: string]: { [key: string]: number } } = {};

  data.map(row => {
    if (!startObj[row.Source]) {
      startObj[row.Source] = {};
    }
    Object.keys(row).map(destination => {
      if (!excludeArr.includes(destination) && row[destination] > 0) {
        if (startObj[row.Source][destination]) {
          startObj[row.Source][destination] = startObj[row.Source][destination] + row[destination];
        } else {
          startObj[row.Source][destination] = row[destination];
        }
      }
    });
    if (Object.keys(startObj[row.Source]).length == 0) {
      delete startObj[row.Source];
    }
  });

  console.log('transition helper func ', startObj);
};
