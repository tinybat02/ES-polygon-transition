import React, { PureComponent } from 'react';
import { PanelProps } from '@grafana/data';
import { PanelOptions, Frame } from 'types';
import { Map, View } from 'ol';
import XYZ from 'ol/source/XYZ';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { fromLonLat } from 'ol/proj';
import { defaults, DragPan, MouseWheelZoom } from 'ol/interaction';
import { platformModifierKeyOnly } from 'ol/events/condition';
import Select from 'ol/interaction/Select';
import { Style, Text, Stroke, Fill } from 'ol/style';
import { pointerMove } from 'ol/events/condition';
import { /* createHeatLayer, */ processTransitionData } from './utils/helpers';
import { nanoid } from 'nanoid';
import 'ol/ol.css';

interface Props extends PanelProps<PanelOptions> {}
interface State {}

export class MainPanel extends PureComponent<Props, State> {
  id = 'id' + nanoid();
  map: Map;
  randomTile: TileLayer;
  heatLayer: VectorLayer;

  componentDidMount() {
    const { tile_url, zoom_level, center_lon, center_lat } = this.props.options;

    console.log('polygon-transition ', this.props.data);
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

    // if (this.props.data.series.length > 0) {
    //   if (this.props.options.geojson) {
    //     this.heatLayer = createHeatLayer(this.props.data.series as Frame[], this.props.options.geojson);
    //     this.map.addLayer(this.heatLayer);
    //   }
    // }

    if (this.props.data.series.length > 1 /* && this.props.options.geojson */) {
      const heatData = [];
      const transitionData: Frame[] = [];
      this.props.data.series.map(serie => {
        if (serie.name !== 'docs') {
          heatData.push(serie);
        } else {
          transitionData.push(serie as Frame);
        }
      });

      // this.heatLayer = createHeatLayer(this.props.data.series.slice(0, -1) as Frame[], this.props.options.geojson);
      if (transitionData.length > 0 && transitionData[0].fields[0].values.buffer.length > 0) {
        console.log('transitionData ', transitionData);

        processTransitionData(transitionData[0].fields[0].values.buffer);
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
    this.map.addInteraction(hoverInteraction);
  }

  // componentDidUpdate(prevProps: Props) {
  //   if (prevProps.data.series !== this.props.data.series) {
  //     if (this.props.options.geojson) {
  //       this.map.removeLayer(this.heatLayer);
  //       this.heatLayer = createHeatLayer(this.props.data.series as Frame[], this.props.options.geojson);
  //       this.map.addLayer(this.heatLayer);
  //     }
  //   }

  //   if (prevProps.options.tile_url !== this.props.options.tile_url) {
  //     if (this.randomTile) {
  //       this.map.removeLayer(this.randomTile);
  //     }
  //     if (this.props.options.tile_url !== '') {
  //       this.randomTile = new TileLayer({
  //         source: new XYZ({
  //           url: this.props.options.tile_url,
  //         }),
  //         zIndex: 1,
  //       });
  //       this.map.addLayer(this.randomTile);
  //     }
  //   }

  //   if (prevProps.options.zoom_level !== this.props.options.zoom_level) {
  //     this.map.getView().setZoom(this.props.options.zoom_level);
  //   }

  //   if (
  //     prevProps.options.center_lat !== this.props.options.center_lat ||
  //     prevProps.options.center_lon !== this.props.options.center_lon
  //   ) {
  //     this.map.getView().animate({
  //       center: fromLonLat([this.props.options.center_lon, this.props.options.center_lat]),
  //       duration: 2000,
  //     });
  //   }
  // }

  render() {
    const { width, height } = this.props;

    return <div id={this.id} style={{ width, height }}></div>;
  }
}
