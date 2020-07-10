import { Vector as VectorLayer } from 'ol/layer';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import { Coordinate } from 'ol/coordinate';
import { Style, Fill, Stroke, Text } from 'ol/style';
import { Frame, GeoJSON, FeatureGeojson } from '../types';

const percentageToHsl = (percentage: number) => {
  const hue = percentage * -120 + 120;
  return 'hsla(' + hue + ', 100%, 50%, 0.3)';
};

const createPolygon = (coordinates: number[][][], value: string, label: string, color: string) => {
  const polygonFeature = new Feature({
    type: 'Polygon',
    geometry: new Polygon(coordinates).transform('EPSG:4326', 'EPSG:3857'),
  });
  polygonFeature.set('value', value);
  polygonFeature.set('label', label);
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
          feature.properties.name,
          percentageToHsl(percentage)
        )
      );
    }
  });

  return new VectorLayer({
    source: new VectorSource({
      features: polygons,
    }),
    zIndex: 2,
  });
};

export const createLine = (path: Coordinate[], label: string) => {
  const lineFeature = new Feature(new LineString(path).transform('EPSG:4326', 'EPSG:3857'));

  lineFeature.setStyle(
    new Style({
      stroke: new Stroke({
        color: '#49A8DE',
        width: 2,
      }),
      text: new Text({
        stroke: new Stroke({
          color: '#fff',
          width: 4,
        }),
        font: '16px Calibri,sans-serif',
        text: label,
      }),
    })
  );
  return lineFeature;
};

export const createLayer = (features: Feature[]) => {
  return new VectorLayer({
    source: new VectorSource({
      features: features,
    }),
    zIndex: 3,
  });
};

export const processTransitionData = (data: any[]) => {
  const excludeArr = ['_id', '_index', '_type', 'Source', 'timestamp'];
  const startObj: { [key: string]: { [key: string]: number } } = {};
  const destObj: { [key: string]: { [key: string]: number } } = {};

  data.map(row => {
    if (!startObj[row.Source]) startObj[row.Source] = {};

    Object.keys(row).map(destination => {
      if (!excludeArr.includes(destination) && row[destination] > 0) {
        startObj[row.Source][destination]
          ? (startObj[row.Source][destination] += row[destination])
          : (startObj[row.Source][destination] = row[destination]);

        if (!destObj[destination]) destObj[destination] = {};

        destObj[destination][row.Source]
          ? (destObj[destination][row.Source] += row[destination])
          : (destObj[destination][row.Source] = row[destination]);
      }
    });
  });

  Object.keys(startObj).map(start => {
    if (Object.keys(start).length == 0) delete startObj[start];
  });

  return { startObj, destObj };
};

export const findOptimalMatch = (startCoords: FeatureGeojson[], endCoords: FeatureGeojson[]) => {
  let startPoint: FeatureGeojson | null = null,
    endPoint: FeatureGeojson | null = null,
    found = false;
  startCoords.map(startP => {
    if (found) return;
    endCoords.map(endP => {
      if (startP.properties.level == endP.properties.level) {
        startPoint = startP;
        endPoint = endP;
        found = true;
        return;
      }
    });
  });

  if (found && startPoint && endPoint) {
    return { startPoint, endPoint };
  } else {
    return { startPoint: startCoords[0], endPoint: endCoords[0] };
  }
};
