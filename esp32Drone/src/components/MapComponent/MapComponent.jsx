import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState } from 'react';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const MapComponent = () => {
  const [markers, setMarkers] = useState([]);

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        setMarkers((prev) => [...prev, e.latlng]);
      },
    });
    return null;
  };

  return (
    <MapContainer center={[25.0330, 121.5654]} zoom={13} style={{ height: '100%', width: '100%', borderRadius: '10px'}}>
      <TileLayer
        attribution='&copy; <a href="http://osm.org">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler />
      {markers.map((pos, idx) => (
        <Marker key={idx} position={pos}>
          <Popup>航點 {idx + 1}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default MapComponent;
