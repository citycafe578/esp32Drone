import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L, { LatLng, LeafletMouseEvent } from 'leaflet'
import { useState, FC } from 'react'

interface LatLngCoord {
    lat: number
    lng: number
}

// 配置 leaflet 圖標
const defaultIcon = L.icon({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
})

L.Marker.prototype.options.icon = defaultIcon

const MapComponent: FC = () => {
    const [markers, setMarkers] = useState<LatLngCoord[]>([])

    const MapClickHandler: FC = () => {
        useMapEvents({
        click(e: LeafletMouseEvent) {
            setMarkers((prev) => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }])
        },
        })
        return null
    }

    return (
        <MapContainer center={[25.0330, 121.5654] as [number, number]} zoom={13} style={{ height: '100%', width: '100%', borderRadius: '10px' }}>
        <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="http://osm.org">OpenStreetMap</a>'
        />
        <MapClickHandler />
        {markers.map((pos, idx) => (
            <Marker key={idx} position={[pos.lat, pos.lng]}>
            <Popup>航點 {idx + 1}</Popup>
            </Marker>
        ))}
        </MapContainer>
    )
}

export default MapComponent
