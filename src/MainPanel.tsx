import React, { PureComponent } from 'react';
import { PanelProps } from '@grafana/data';
import { PanelOptions, Frame, FeatureGeojson } from 'types';
import { Map, View } from 'ol';
import XYZ from 'ol/source/XYZ';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { fromLonLat } from 'ol/proj';
import { defaults, DragPan, MouseWheelZoom } from 'ol/interaction';
import { platformModifierKeyOnly } from 'ol/events/condition';
import Select from 'ol/interaction/Select';
import { Style, Text, Stroke, Fill } from 'ol/style';
import { pointerMove } from 'ol/events/condition';
import { SelectEvent } from 'ol/interaction/Select';
import Feature from 'ol/Feature';
import { createHeatLayer, processTransitionData, findOptimalMatch, createLine, createLayer } from './utils/helpers';
import PathFinder from 'geojson-path-finder';
import { nanoid } from 'nanoid';
import 'ol/ol.css';

interface Props extends PanelProps<PanelOptions> {}
interface State {
  currentPolygon: string | null;
}

export class MainPanel extends PureComponent<Props, State> {
  id = 'id' + nanoid();
  map: Map;
  randomTile: TileLayer;
  heatLayer: VectorLayer;
  transitionLayer: VectorLayer;
  startObj: { [key: string]: { [key: string]: number } };
  destObj: { [key: string]: { [key: string]: number } };

  state: State = {
    currentPolygon: null,
  };

  componentDidMount() {
    const { tile_url, zoom_level, center_lon, center_lat } = this.props.options;

    const carto = new TileLayer({
      source: new XYZ({
        url: 'https://{1-4}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      }),
    });

    this.map = new Map({
      interactions: defaults({ dragPan: false, mouseWheelZoom: false, onFocusOnly: true }).extend([
        new DragPan({
          condition: function(event) {
            return platformModifierKeyOnly(event) || this.getPointerCount() === 2;
          },
        }),
        new MouseWheelZoom({
          condition: platformModifierKeyOnly,
        }),
      ]),
      layers: [carto],
      view: new View({
        center: fromLonLat([center_lon, center_lat]),
        zoom: zoom_level,
      }),
      target: this.id,
    });

    if (tile_url !== '') {
      this.randomTile = new TileLayer({
        source: new XYZ({
          url: tile_url,
        }),
        zIndex: 1,
      });
      this.map.addLayer(this.randomTile);
    }

    if (this.props.data.series.length > 1 && this.props.options.geojson) {
      const heatData: Frame[] = [];
      const transitionData: Frame[] = [];
      this.props.data.series.map(serie => {
        if (serie.name !== 'docs') {
          heatData.push(serie as Frame);
        } else {
          transitionData.push(serie as Frame);
        }
      });

      this.heatLayer = createHeatLayer(heatData, this.props.options.geojson);
      this.map.addLayer(this.heatLayer);

      if (transitionData.length > 0 && transitionData[0].fields[0].values.buffer.length > 0) {
        const { startObj, destObj } = processTransitionData(transitionData[0].fields[0].values.buffer);
        this.startObj = startObj;
        this.destObj = destObj;
      }
    }

    const hoverInteraction = new Select({
      condition: pointerMove,
      style: function(feature) {
        const style: { [key: string]: any[] } = {};
        const geometry_type = feature.getGeometry().getType();

        style['Polygon'] = [
          new Style({
            fill: new Fill({
              color: feature.get('color'),
            }),
          }),
          new Style({
            text: new Text({
              stroke: new Stroke({
                color: '#fff',
                width: 2,
              }),
              font: '18px Calibri,sans-serif',
              text: feature.get('value'),
            }),
          }),
        ];

        return style[geometry_type];
      },
    });
    hoverInteraction.on('select', (e: SelectEvent) => {
      const selectedFeature = e.target.getFeatures().item(0);

      if (selectedFeature) {
        if (selectedFeature.get('label') !== this.state.currentPolygon) {
          this.setState({ currentPolygon: selectedFeature.get('label') });
        }
      } else {
        this.setState({ currentPolygon: null });
      }
    });
    this.map.addInteraction(hoverInteraction);
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    // if (prevProps.data.series !== this.props.data.series) {
    //   if (this.props.options.geojson) {
    //     this.map.removeLayer(this.heatLayer);
    //     this.heatLayer = createHeatLayer(this.props.data.series as Frame[], this.props.options.geojson);
    //     this.map.addLayer(this.heatLayer);
    //   }
    // }

    if (prevProps.options.tile_url !== this.props.options.tile_url) {
      if (this.randomTile) {
        this.map.removeLayer(this.randomTile);
      }
      if (this.props.options.tile_url !== '') {
        this.randomTile = new TileLayer({
          source: new XYZ({
            url: this.props.options.tile_url,
          }),
          zIndex: 1,
        });
        this.map.addLayer(this.randomTile);
      }
    }

    if (prevProps.options.zoom_level !== this.props.options.zoom_level) {
      this.map.getView().setZoom(this.props.options.zoom_level);
    }

    if (
      prevProps.options.center_lat !== this.props.options.center_lat ||
      prevProps.options.center_lon !== this.props.options.center_lon
    ) {
      this.map.getView().animate({
        center: fromLonLat([this.props.options.center_lon, this.props.options.center_lat]),
        duration: 2000,
      });
    }

    if (prevState.currentPolygon !== this.state.currentPolygon) {
      if (!this.state.currentPolygon) {
        this.map.removeLayer(this.transitionLayer);
      }
    }

    if (
      this.props.options.topology &&
      this.state.currentPolygon &&
      prevState.currentPolygon !== this.state.currentPolygon
    ) {
      this.map.removeLayer(this.transitionLayer);
      console.log('from ', this.startObj[this.state.currentPolygon]);
      console.log('to ', this.destObj[this.state.currentPolygon]);
      const currentStore = this.state.currentPolygon;

      const all_stores = [
        ...new Set([
          currentStore,
          ...(this.startObj[currentStore] ? Object.keys(this.startObj[currentStore]) : []),
          ...(this.destObj[currentStore] ? Object.keys(this.destObj[currentStore]) : []),
        ]),
      ];
      const coord: { [key: string]: FeatureGeojson[] } = {};

      all_stores.map(store => {
        this.props.options.topology
          ? (coord[store] = this.props.options.topology.features.filter(
              feature => feature.properties && feature.properties.name == store
            ))
          : null;
      });

      if (coord[currentStore].length > 0) {
        const pathFinder = new PathFinder(this.props.options.topology);
        const pathFeatureArray: Feature[] = [];
        if (this.startObj[currentStore] && !this.destObj[currentStore]) {
          Object.keys(this.startObj[currentStore]).map(target => {
            if (coord[target].length > 0) {
              const { startPoint, endPoint } = findOptimalMatch(coord[currentStore], coord[target]);
              const path = pathFinder.findPath(startPoint, endPoint).path;
              pathFeatureArray.push(createLine(path, `From: ${this.startObj[currentStore][target]}`));
            } else {
              console.log('not found store ', target);
            }
          });
        } else if (!this.startObj[currentStore] && this.destObj[currentStore]) {
          Object.keys(this.destObj[currentStore]).map(from => {
            if (coord[from].length > 0) {
              const { startPoint, endPoint } = findOptimalMatch(coord[currentStore], coord[from]);
              const path = pathFinder.findPath(startPoint, endPoint).path;
              pathFeatureArray.push(createLine(path, `To: ${this.destObj[currentStore][from]}`));
            } else {
              console.log('not found store ', from);
            }
          });
        } else {
          Object.keys(this.startObj[currentStore]).map(target => {
            if (coord[target].length > 0) {
              const { startPoint, endPoint } = findOptimalMatch(coord[currentStore], coord[target]);
              const path = pathFinder.findPath(startPoint, endPoint).path;
              pathFeatureArray.push(
                createLine(
                  path,
                  `From: ${this.startObj[currentStore][target]} -> ${
                    this.destObj[currentStore][target] ? `- To: ${this.destObj[currentStore][target]}` : ''
                  }`
                )
              );
            } else {
              console.log('not found store ', target);
            }
          });

          Object.keys(this.destObj[currentStore]).map(from => {
            if (!this.startObj[currentStore][from]) {
              if (coord[from].length > 0) {
                const { startPoint, endPoint } = findOptimalMatch(coord[currentStore], coord[from]);
                const path = pathFinder.findPath(startPoint, endPoint).path;
                pathFeatureArray.push(createLine(path, `To: ${this.destObj[currentStore][from]}`));
              } else {
                console.log('not found store ', from);
              }
            }
          });
        }

        this.transitionLayer = createLayer(pathFeatureArray);
        this.map.addLayer(this.transitionLayer);
      } else {
        console.log('not found coord of current hover', currentStore);
      }
    }
  }

  render() {
    const { width, height } = this.props;

    return <div id={this.id} style={{ width, height }}></div>;
  }
}
