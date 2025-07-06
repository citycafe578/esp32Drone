import { useEffect, useState } from 'react'
import './App.css'

const OtherDataItem = ({title, return_data}) => {
  return(
    <div className='other_item' style={{display: 'flex', flexDirection: 'column', backgroundColor: 'gray', width: '340px', height: '180px', margin: '15px', borderRadius: '10px'}}>
      <div style={{display: 'flex', width: '100%', height: '150px', alignItems: 'center', justifyContent: 'center'}}>
        <h2>{title}</h2>
      </div>
      <div style={{display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center'}}>
        <h1>return_data</h1>
      </div>
    </div>
  )
};

const SideUpBar = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bottom-sheet ${open ? 'open' : ''}`}>
      <div className="drag-handle" onClick={() => setOpen(!open)}>
        <div className="handle-bar" />
      </div>
      <div className="sheet-content">
        <h1>ababab</h1>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <div id="app-wrapper" style={{display: 'flex', flexDirection: 'column',height: '100vh'}}>
      <div id='digital_display'>
        <div id='stream' className='digital_item'>
          <h1>stream</h1>
        </div>
        <div id='map' className='digital_item'>
          <h1>map</h1>
        </div>
      </div>

      <div id='other_display' style={{display: 'flex', flexDirection: 'row', justifyContent: 'space-between'}}>
        <OtherDataItem title = 'COURSE' return_data = ' ' />
        <OtherDataItem title = 'HEIGHT' return_data = ' ' />
        <OtherDataItem title = '123' return_data = ' ' />
        <OtherDataItem title = '456' return_data = ' ' />
        <OtherDataItem title = '789' return_data = ' ' />
      </div>
      
      <SideUpBar/>
      
    </div>
  );
}

export default App;
