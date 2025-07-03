import { useEffect, useState } from 'react'
import './App.css'

const Card = ({title}) => {
  const [hasLiked, setHasLiked] = useState(false)

  useEffect(() => {
    console.log(`${title} has been change`)
  });

  return (
    <div className='card'>
      <h2>{title}</h2>
      <button onClick={() => setHasLiked(!hasLiked)}>
        {hasLiked ? 'A': 'B'}
      </button>
    </div>
  );
};

const App = () => {
  return (
    <div id='digital_display'>
      <div id='stream' className='digital_item'>
        
      </div>
      <div id='map' className='digital_item'>
        
      </div>
    </div>
  );
};

export default App;
