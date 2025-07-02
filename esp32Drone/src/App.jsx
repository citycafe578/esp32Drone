import { useEffect, useState } from 'react'

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
    <div>
      <h1>Hello World</h1>
      <Card title = "1"/>
      <Card title = "2"/>
      <Card title = "3"/>
      <Card title = "4"/>
    </div>
  );
};

export default App;
