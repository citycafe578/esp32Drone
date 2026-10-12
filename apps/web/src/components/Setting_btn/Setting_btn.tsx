import { useState, FC } from "react"
import './Setting_btn.css'

interface SettingBtnProps {
  onClick: () => void
}

const SettingBtn: FC<SettingBtnProps> = ({ onClick }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false)

  const handleClick = () => {
    setIsOpen(!isOpen)
    onClick()
  }

  return (
    <button className={`setting-btn ${isOpen ? 'open' : ''}`} onClick={handleClick}>
      <img src="/gear.png" alt="設定" />
    </button>
  )
}

export default SettingBtn
