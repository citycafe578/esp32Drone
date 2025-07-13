import { useState } from "react";
import './Setting_btn.css';

const SettingBtn = ({ onClick }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = () => {
    setIsOpen(!isOpen);
    onClick();
  };

  return (
    <button className={`setting-btn ${isOpen ? 'open' : ''}`} onClick={handleClick}>
      <img src="/gear.png" alt="設定" />
    </button>
  );
}

export default SettingBtn;