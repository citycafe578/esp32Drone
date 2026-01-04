import "./SideUpBar.css";
import MapComponent from "../MapComponent/MapComponent";

const SideUpBar = ({ open, setOpen, markers, addMarker }) => {
  return (
    <>
      {open && <div className="overlay" />}
      <div className={`bottom-sheet ${open ? "open" : ""}`}>
        <div className="drag-handle" onClick={() => setOpen(!open)}>
          <div className="handle-bar" />
        </div>
        <div className="sheet-content">
          <div
            style={{
              width: "100%",
              height: "5%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <h2>Autopilot Settings</h2>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              width: "100%",
              height: "95%",
            }}
          >
            <div id="auto_pilot_map">
              <MapComponent />
            </div>
            <div id="waypoint_setting">
              <div
                id="waypoints_bar"
                style={{
                  display: "flex",
                  height: "90%",
                  width: "100%",
                  background: "red",
                }}
              ></div>

              <button id="save_and_cancel_btns">Clear All</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SideUpBar;