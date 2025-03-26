import ForceGraph from "./graph-pixi.js";

async function getData() {
  try {
    // const params = {
    //   method: "GET",
    //   mode: "cors",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    // };

    async function loadEdgesJson() {
      try {
        console.log('Base URL:', import.meta.env.BASE_URL);
        console.log('Current URL:', window.location.href);

        // Try multiple path variations
        const paths = [
          `${import.meta.env.BASE_URL}assets/edges.json`,
          '/assets/edges.json',
          './assets/edges.json',
          `${window.location.pathname}assets/edges.json`
        ];

        for (const path of paths) {
          try {
            console.log(`Attempting to fetch: ${path}`);
            const response = await fetch(path);

            if (!response.ok) {
              console.error(`Failed to fetch ${path}. Status: ${response.status}`);
              continue;
            }

            const data = await response.json();
            console.log(`Successfully loaded data from ${path}:`, data);
            return data;
          } catch (fetchError) {
            console.error(`Error fetching ${path}:`, fetchError);
          }
        }

        throw new Error('Could not load edges.json from any attempted path');
      } catch (error) {
        console.error('Overall loading error:', error);
        throw error;
      }
    }

// Call the function
    loadEdgesJson()
      .then(data => {
        console.log('Final loaded data:', data);
      })
      .catch(error => {
        console.error('Failed to load edges.json:', error);
      });
    //const [response1, response2] = await Promise.all([fetch("/api/nodes", params), fetch("/api/edges", params)]);
    const [response1, response2] = await Promise.all([fetch(`${import.meta.env.BASE_URL}assets/nodes.json`), fetch(`${import.meta.env.BASE_URL}assets/edges.json`)]);


    if (!response1.ok || !response2.ok) {
      throw new Error(`HTTP error! Status: ${response1.status} ${response2.status}`);
    }

    const resultNodes = await response1.json();
    const resultEdges = await response2.json();

    if (resultNodes && resultEdges) {
      const colors = ["#418BFC", "#46BCC8", "#D6AB1B", "#EB5E68", "#B6BE1C", "#F64D1A", "#BA6DE4", "#EA6BCB", "#B9AAC8", "#F08519"];
      const resultNodesTrunc = resultNodes.map((d) => {
        return {
          NAME: d.NAME,
          DEFINITION: d.DEFINITION,
          SUBMODULE: d.SUBMODULE, // MUST BE A UNIQUE ID
          SUBMODULE_NAME: d["SUBMODULE NAME"], // PREFERABLY A UNIQUE LABEL
          SEGMENT: d.SEGMENT, // MUST BE A UNIQUE ID
          SEGMENT_NAME: d["SEGMENT NAME"], // PREFERABLY A UNIQUE LABEL
          UNITS: d.UNITS,
          ReportValue: d.ReportValue,
          ...d
        };
      });

      // Execute the function to generate a new network
      ForceGraph(
        { nodes: resultNodesTrunc, links: resultEdges },
        {
          containerSelector: "#app",
          nodeId: "NAME",
          sourceId: "UsesVariable",
          targetId: "Variable",
          nodeGroup: (d) => d.SUBMODULE,
          nodeTitle: (d) => d.NAME,
          //nodeRadius: (d) => d.DIMENSION1,
          nodeStroke: "#000",
          linkStrokeWidth: 0.6,
          linkStroke: "#fff",
          labelColor: "#fff",
          labelScale: 3,
          colors,
          width: window.innerWidth,
          height: window.innerHeight,
        }
      );
    } else {
      throw new Error("Invalid response format");
    }
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

getData();
