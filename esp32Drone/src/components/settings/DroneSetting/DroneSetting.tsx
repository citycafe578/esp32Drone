import { useState, useEffect, FC } from 'react'
//import './DroneSetting.css';
import '../JoystickSetting/JoystickSetting.css'
import '../../../App.css'

interface DroneSettings {
    minimumCruisingAltitude: string
    lowAltitudeWarning: string
    imageHorizontalFlip: string
    imageVerticalFlip: string
    maximumCruisingAltitude: string
    geoFenceRadius: string
    autoReturnHome: string
    autoLanding: string
}

const DroneSetting: FC = () => {
    const getInitDroneSettings = (): DroneSettings => {
        const local = localStorage.getItem("droneSettings")
        if (local) {
        const parsed = JSON.parse(local) as Partial<DroneSettings>
        return {
            minimumCruisingAltitude: parsed.minimumCruisingAltitude || "OFF",
            lowAltitudeWarning: parsed.lowAltitudeWarning || "OFF",
            imageHorizontalFlip: parsed.imageHorizontalFlip || "False",
            imageVerticalFlip: parsed.imageVerticalFlip || "False",
            maximumCruisingAltitude: parsed.maximumCruisingAltitude || "",
            geoFenceRadius: parsed.geoFenceRadius || "",
            autoReturnHome: parsed.autoReturnHome || "False",
            autoLanding: parsed.autoLanding || "False"
        }
        }
        return {
        minimumCruisingAltitude: "OFF",
        lowAltitudeWarning: "OFF",
        imageHorizontalFlip: "False",
        imageVerticalFlip: "False",
        maximumCruisingAltitude: "2",
        geoFenceRadius: "OFF",
        autoReturnHome: "OFF",
        autoLanding: "OFF"
        }
    }

    const initSettings = getInitDroneSettings()

    const [minimumCruisingAltitude, setMinimumCruisingAltitude] = useState<string>(initSettings.minimumCruisingAltitude)
    const [lowAltitudeWarning, setLowAltitudeWarning] = useState<string>(initSettings.lowAltitudeWarning)
    const [imageHorizontalFlip, setImageHorizontalFlip] = useState<string>(initSettings.imageHorizontalFlip)
    const [imageVerticalFlip, setImageVerticalFlip] = useState<string>(initSettings.imageVerticalFlip)
    const [cameraChecked, setCameraChecked] = useState<boolean>(false)
    const [maximumCruisingAltitude, setMaximumCruisingAltitude] = useState<string>(initSettings.maximumCruisingAltitude)
    const [geoFenceRadius, setGeoFenceRadius] = useState<string>(initSettings.geoFenceRadius)
    const [autoReturnHome, setAutoReturnHome] = useState<string>(initSettings.autoReturnHome)
    const [autoLanding, setAutoLanding] = useState<string>(initSettings.autoLanding)

    useEffect(() => {
        const saved = localStorage.getItem("droneSettings")
        if (saved) {
        const parsedSaved = JSON.parse(saved) as Partial<DroneSettings>
        setMinimumCruisingAltitude(parsedSaved.minimumCruisingAltitude || "OFF")
        setLowAltitudeWarning(parsedSaved.lowAltitudeWarning || "OFF")
        setImageHorizontalFlip(parsedSaved.imageHorizontalFlip === "True" ? "True" : "False")
        setImageVerticalFlip(parsedSaved.imageVerticalFlip === "True" ? "True" : "False")
        setAutoReturnHome(parsedSaved.autoReturnHome === "True" ? "True" : "False")
        setMaximumCruisingAltitude(parsedSaved.maximumCruisingAltitude || "")
        setGeoFenceRadius(parsedSaved.geoFenceRadius || "")
        setAutoLanding(parsedSaved.autoLanding === "True" ? "True" : "False")
        }
    }, [])

    useEffect(() => {
        const settings: DroneSettings = {
        minimumCruisingAltitude,
        lowAltitudeWarning,
        imageHorizontalFlip,
        imageVerticalFlip,
        maximumCruisingAltitude,
        geoFenceRadius,
        autoReturnHome,
        autoLanding
        }
        localStorage.setItem("droneSettings", JSON.stringify(settings))
        fetch('http://localhost:5000/set_drone_settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            minimumCruisingAltitude,
            lowAltitudeWarning,
            imageHorizontalFlip: imageHorizontalFlip === "True",
            imageVerticalFlip: imageVerticalFlip === "True",
            maximumCruisingAltitude,
            geoFenceRadius,
            autoReturnHome: autoReturnHome === "True",
            autoLanding: autoLanding === "True"
        })
        })
    }, [minimumCruisingAltitude, lowAltitudeWarning, imageHorizontalFlip, imageVerticalFlip, maximumCruisingAltitude, geoFenceRadius, autoReturnHome, autoLanding])

    useEffect(() => {
        if (cameraChecked) {
        fetch('http://localhost:5000/pause_camera', { method: 'POST' })
        return () => {
            fetch('http://localhost:5000/resume_camera', { method: 'POST' })
        }
        }
    }, [cameraChecked])

    useEffect(() => {
        setCameraChecked(true)
    }, [])

    return (
        <div
        style={{
            height: '63vh',
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center'
        }}
        >
        {/* 左邊 */}
        <div className='column_bar'>
            <div className='settings'>
            <h1>Minimum Cruising Altitude (cm)</h1>
            <select
                value={minimumCruisingAltitude}
                onChange={(e) => setMinimumCruisingAltitude(e.target.value)}
            >
                <option>OFF</option>
                <option>25</option>
                <option>50</option>
                <option>75</option>
                <option>100</option>
                <option>125</option>
                <option>150</option>
                <option>175</option>
                <option>200</option>
            </select>
            </div>

            <div className='settings'>
            <h1>Image Horizontal Flip</h1>
            <select
                value={imageHorizontalFlip}
                onChange={(e) => setImageHorizontalFlip(e.target.value)}
            >
                <option value="False">False</option>
                <option value="True">True</option>
            </select>
            </div>

            <div className='settings'>
            <h1>Low Altitude Warning (cm)</h1>
            <select
                value={lowAltitudeWarning}
                onChange={(e) => setLowAltitudeWarning(e.target.value)}
            >
                <option>OFF</option>
                <option>25</option>
                <option>50</option>
                <option>75</option>
                <option>100</option>
                <option>125</option>
                <option>150</option>
                <option>175</option>
                <option>200</option>
            </select>
            </div>

            <div className="settings">
            <h1 style={{ justifyContent: 'left' }}>Auto Return Home</h1>
            <select
                value={autoReturnHome}
                onChange={(e) => setAutoReturnHome(e.target.value)}
            >
                <option value="False">OFF</option>
                <option value="True">ON</option>
            </select>
            </div>
        </div>

        {/* 右邊 */}
        <div className='column_bar'>

            <div className='settings'>
            <h1>Maximum Cruising Altitude (cm)</h1>
            <select
                value={maximumCruisingAltitude}
                onChange={(e) => setMaximumCruisingAltitude(e.target.value)}
            >
                <option>OFF</option>
                <option>200</option>
                <option>500</option>
                <option>1000</option>
                <option>1500</option>
            </select>
            </div>

            <div className='settings'>
            <h1>Image Vertical Flip</h1>
            <select
                value={imageVerticalFlip}
                onChange={(e) => setImageVerticalFlip(e.target.value)}
            >
                <option>False</option>
                <option>True</option>
            </select>
            </div>

            <div className="settings">
            <h1 style={{ justifyContent: 'left' }}>Geo Fence Radius (m)</h1>
            <select
                value={geoFenceRadius}
                onChange={(e) => setGeoFenceRadius(e.target.value)}
            >
                <option>OFF</option>
                <option>25</option>
                <option>50</option>
                <option>75</option>
                <option>100</option>
            </select>
            </div>

            <div className="settings">
            <h1 style={{ justifyContent: 'left' }}>Auto Landing</h1>
            <select
                value={autoLanding}
                onChange={(e) => setAutoLanding(e.target.value)}
            >
                <option value="False">OFF</option>
                <option value="True">ON</option>
            </select>
            </div>
        </div>
        </div>
    )
}

export default DroneSetting
