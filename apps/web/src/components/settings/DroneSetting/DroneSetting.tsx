import { useState, useEffect, FC } from 'react'
//import './DroneSetting.css';
import '../JoystickSetting/JoystickSetting.css'
import '../../../App.css'
import { readSetting, saveSetting } from '../../../settingsStore'

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
    const getInitDroneSettings = (): DroneSettings => ({
        minimumCruisingAltitude: "OFF",
        lowAltitudeWarning: "OFF",
        imageHorizontalFlip: "False",
        imageVerticalFlip: "False",
        maximumCruisingAltitude: "OFF",
        geoFenceRadius: "OFF",
        autoReturnHome: "False",
        autoLanding: "False",
        ...readSetting<Partial<DroneSettings>>('droneSettings', {}),
    })

    const initSettings = getInitDroneSettings()

    const [minimumCruisingAltitude, setMinimumCruisingAltitude] = useState<string>(initSettings.minimumCruisingAltitude)
    const [lowAltitudeWarning, setLowAltitudeWarning] = useState<string>(initSettings.lowAltitudeWarning)
    const [imageHorizontalFlip, setImageHorizontalFlip] = useState<string>(initSettings.imageHorizontalFlip)
    const [imageVerticalFlip, setImageVerticalFlip] = useState<string>(initSettings.imageVerticalFlip)
    const [maximumCruisingAltitude, setMaximumCruisingAltitude] = useState<string>(initSettings.maximumCruisingAltitude)
    const [geoFenceRadius, setGeoFenceRadius] = useState<string>(initSettings.geoFenceRadius)
    const [autoReturnHome, setAutoReturnHome] = useState<string>(initSettings.autoReturnHome)
    const [autoLanding, setAutoLanding] = useState<string>(initSettings.autoLanding)

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
        saveSetting('droneSettings', settings)   // 後端存檔後，相機翻轉等設定會立即生效
    }, [minimumCruisingAltitude, lowAltitudeWarning, imageHorizontalFlip, imageVerticalFlip, maximumCruisingAltitude, geoFenceRadius, autoReturnHome, autoLanding])

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
            <h1 style={{ justifyContent: 'left' }}>Auto Return Home (需韌體支援)</h1>
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
            <h1 style={{ justifyContent: 'left' }}>Auto Landing (需韌體支援)</h1>
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
