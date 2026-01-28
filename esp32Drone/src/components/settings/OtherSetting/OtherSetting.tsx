import { useState, useEffect, FC, ChangeEvent } from 'react'
import '../JoystickSetting/JoystickSetting.css'
import '../../../App.css'

interface OtherSettings {
  imageTransmission: string
  reciver: string
  transmissionPower: string
  LAWSE: string
  sharpen: string
  grayscale: string
}

interface Port {
  device: string
  name: string
}

const OtherSetting: FC = () => {
  const getInitOtherSettings = (): OtherSettings => {
    const local = localStorage.getItem("otherSettings")
    if (local) {
      const parsed = JSON.parse(local) as Partial<OtherSettings>
      return {
        imageTransmission: parsed.imageTransmission || "",
        reciver: parsed.reciver || "",
        transmissionPower: parsed.transmissionPower || "",
        LAWSE: parsed.LAWSE || "",
        sharpen: parsed.sharpen || "",
        grayscale: parsed.grayscale || ""
      }
    }
    return {
      imageTransmission: "",
      reciver: "",
      transmissionPower: "",
      LAWSE: "",
      sharpen: "",
      grayscale: ""
    }
  }

  const initSettings = getInitOtherSettings()
  const [imageTransmission, setImageTransmission] = useState<string>(initSettings.imageTransmission)
  const [cameras, setCameras] = useState<number[]>([])
  const [reciver, setReciver] = useState<string>(initSettings.reciver)
  const [ports, setPorts] = useState<Port[]>([])
  const [transmissionPower, setTransmissionPower] = useState<string>(initSettings.transmissionPower)
  const [LAWSE, setLAWSE] = useState<string>(initSettings.LAWSE)
  const [sharpen, setSharpen] = useState<string>(initSettings.sharpen)
  const [grayscale, setGrayscale] = useState<string>(initSettings.grayscale)

  useEffect(() => {
    const saved = localStorage.getItem("otherSettings")
    if (saved) {
      const parsedSaved = JSON.parse(saved) as Partial<OtherSettings>
      setImageTransmission(parsedSaved.imageTransmission || "")
      setReciver(parsedSaved.reciver || "")
      setTransmissionPower(parsedSaved.transmissionPower || "")
      setLAWSE(parsedSaved.LAWSE || "")
      setSharpen(parsedSaved.sharpen || "")
      setGrayscale(parsedSaved.grayscale || "")
    }
  }, [])

  useEffect(() => {
    const settings: OtherSettings = {
      imageTransmission,
      reciver,
      transmissionPower,
      LAWSE,
      sharpen,
      grayscale
    }
    localStorage.setItem("otherSettings", JSON.stringify(settings))
  }, [imageTransmission, reciver, transmissionPower, LAWSE, sharpen, grayscale])

  useEffect(() => {
    fetch('http://localhost:5000/list_cameras')
      .then(res => res.json())
      .then((data: { cameras: number[] }) => {
        setCameras(data.cameras)
      })
      .catch((err: Error) => console.error('Error fetching cameras:', err))
  }, [])

  useEffect(() => {
    fetch('http://localhost:5000/get_ports')
      .then(res => res.json())
      .then((data: { ports: Port[] }) => {
        setPorts(data.ports)
      })
      .catch((err: Error) => console.error('Error fetching ports:', err))
  }, [])

  const handleCameraChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const idx = e.target.value
    setImageTransmission(idx)
    fetch('http://localhost:5000/set_camera', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageTransmission: idx })
    })
  }

  const handleReciverChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    setReciver(e.target.value)
  }

  return (
    <div style={{ height: '63vh', width: '100%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {/* 左邊 */}
      <div className='column_bar'>
        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Image Transmission</h1>
          <select
            value={imageTransmission}
            onChange={handleCameraChange}
            style={{ justifyContent: 'right' }}
          >
            <option value="">Select Camera:</option>
            {cameras.map((idx) => (
              <option key={idx} value={idx}>
                Camera {idx}
              </option>
            ))}
          </select>
        </div>

        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Low Altitude Warning Sound Effect</h1>
          <select
            value={LAWSE}
            onChange={(e) => setLAWSE(e.target.value)}
            style={{ justifyContent: 'right' }}
          >
            <option>Sound Effect 1</option>
            <option>Sound Effect 2</option>
            <option>Sound Effect 3</option>
            <option>Sound Effect 4</option>
            <option>Sound Effect 5</option>
          </select>
        </div>

        <div className='settings'>
          <h1>Image Sharpen</h1>
          <select
            value={sharpen}
            onChange={(e) => setSharpen(e.target.value)}
          >
            <option value={0}>0%</option>
            <option value={25}>25%</option>
            <option value={50}>50%</option>
            <option value={75}>75%</option>
            <option value={100}>100%</option>
          </select>
        </div>
      </div>

      {/* 右邊 */}
      <div className='column_bar'>
        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Reciver</h1>
          <select
            value={reciver}
            onChange={handleReciverChange}
          >
            <option value="">Reciver:</option>
            {ports.map((port, idx) => (
              <option key={idx} value={port.device}>
                {port.device} - {port.name}
              </option>
            ))}
          </select>
        </div>

        <div className='settings'>
          <h1 style={{ justifyContent: 'left' }}>Transmission Power</h1>
          <select
            value={transmissionPower}
            onChange={(e) => setTransmissionPower(e.target.value)}
          >
            <option>Low</option>
            <option>High</option>
          </select>
        </div>

        <div className='settings'>
          <h1>Image Grayscale</h1>
          <select
            value={grayscale}
            onChange={(e) => setGrayscale(e.target.value)}
          >
            <option value={0}>0%</option>
            <option value={25}>25%</option>
            <option value={50}>50%</option>
            <option value={75}>75%</option>
            <option value={100}>100%</option>
          </select>
        </div>
      </div>
    </div>
  )
}

export default OtherSetting