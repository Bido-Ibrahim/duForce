import VariableTree from "./tree";
import { config } from "./config";
import * as d3 from "d3";

// functions used by getData in order - dataNullValueCheck, generateParameterData, getHierarchy, setHierarchyData
const dataNullValueCheck = (nodeData, dataType) => {
  // makes sure that there are matching nodes for segment and submodule names
  nodeData.filter((f) => f[dataType] === null).map((m) => {
    const matching = nodeData.find((f) => f[`${dataType}_NAME`] === m[`${dataType}_NAME`]);
    if(matching){
      m[dataType] = matching[dataType];
    } else {
      console.error(`${JSON.stringify(m)} has missing ${dataType} data`);
    }
  });
  return nodeData.filter((f) => f[dataType] !== null);
}

const getPackData = (hierarchy) => {
    hierarchy.count();
    const descendants = hierarchy.descendants();
    const leaves = descendants.filter((d) => !d.children);
    leaves.forEach((d, i) => (d.index = i));

    // Compute the layout.
    d3.pack().size([500, 500]).padding(1)(hierarchy);

    const depth2descendants = hierarchy
      .descendants()
      .filter((f) => f.depth === 2)
      .reduce((acc, entry) => {
        const children = entry.children.reduce((childAcc, child) => {
          childAcc.push({
            x: child.x - entry.x,
            y: child.y - entry.y,
            r: child.r,
            name: child.data.NAME,
            id: child.data.id
          });
          return childAcc;
        }, []);
        acc.push({
          name: entry.data.NAME,
          id: entry.data.id,
          group: entry.data.subModule,
          children,
          r: entry.r
        });

        return acc;
      }, []);

    return depth2descendants;
}
const generateParameterData = (dataNodes, dataLinks) => {
  // building nodes and links here
  const nodeIdVar = "NAME";
  const sourceIdVar = "UsesVariable";
  const targetIdVar = "Variable";
  // add id, type and tier3 nodes to data nodes
  const nodes = dataNodes.reduce((acc, node) => {
    node.id = node[nodeIdVar];
    node.type = "tier3";
    node.subModule = `submodule-${node.SUBMODULE}`
    acc.push(node);
    return acc;
  }, [])

  // filtering out duplicate links and set direction to both if opposite
  const links = dataLinks.reduce((acc, link) =>  {
    link.source = link[sourceIdVar];
    link.target = link[targetIdVar];
    // PRECAUTIONARY ACTION: REMOVE DUPLICATE LINKS and set direction
    if(!acc.some((s) => s.source === link.source && s.target === link.target)){
      const oppositeLink = acc.find((f) => f.source === link.target && f.target === link.source);
      if(oppositeLink){
        oppositeLink.direction = "both";
      } else {
        acc.push(link);
      }
    }
    return acc;
  },[]);

  return {nodes, links};

}

const getHierarchy = (nodes) => {

  const ROOT = { id: "ROOT" };
  // slightly re-written from original since data is simpler for chart - same result
  // get + set submodules
  const SUBMODULES = Array.from(nodes.reduce((acc, node) => {
    acc.add(`${node.SUBMODULE}-${node.SUBMODULE_NAME}`)
    return acc;
  },new Set()))
    .reduce((acc, entry) => {
      const entrySplit = entry.split("-");
      // handling null values
      const subModuleId = `submodule-${entrySplit[0]}`;
      // filtering out duplicates for the demo
      if(!acc.some((f) => f.id === subModuleId)){
        acc.push({
          id: subModuleId,
          parent: "ROOT",
          subModule: subModuleId,
          NAME: entrySplit[1],
          type: "tier1",
        });
      } else {
        console.error(`${entry} is being filtered out as this subModule ID has been used previously with a different subModule Name`)
      }
      return acc;
    },[])
    .sort((a,b) => d3.ascending(a.NAME,b.NAME))

  config.setSubModules(SUBMODULES.map((m) => m.id))

  // get segments
  const SEGMENTS = Array.from(nodes.reduce((acc, node) => {
    acc.add(`${node.SEGMENT}-${node.SEGMENT_NAME}-${node.SUBMODULE}`)
    return acc;
  },new Set()))
    .reduce((acc, entry) => {
      const entrySplit = entry.split("-");
      const parent = `submodule-${entrySplit[2]}`;
      const segmentId =`segment-${entrySplit[0]}`
      // filtering out duplicates for the demo
      if(!acc.some((f) => f.id === segmentId)) {
        acc.push( {
          id: segmentId,
          subModule: parent,
          parent,
          NAME: entrySplit[1],
          type: "tier2",
        });
      } else {
        console.error(`${segmentId} with submodule ${parent} is being filtered out as this segmentId has been used previously with a different Segment Name`)
      }
      return acc;
    },[])

  let data = nodes.reduce((acc, node,i) => {
    acc.push({
      parent: `segment-${node.SEGMENT}`,
      subModule: `submodule-${node.SUBMODULE}`,
      id: node.id,
      NAME: node.NAME,
      type: "tier3"
    })
    return acc;
  },[])

  data = data.sort((a,b) => d3.ascending(a.NAME.toLowerCase(), b.NAME.toLowerCase()));
  const stratifyData = [ROOT].concat(SUBMODULES).concat(SEGMENTS).concat(data);

  return d3
    .stratify()
    .id((d) => d.id)
    .parentId((d) => d.parent)(stratifyData)
    .eachBefore((d,i) => { // sort as previous
      d.data.hOrderPosition = i; // needed to keep correct order of tree menu
    });
}

const setHierarchyData = (nodesCopy) => {

  const getHierarchyLinks = (nodeSet, allLinks) =>  Array.from(nodeSet).reduce((acc, parent) => {
    // used below
    const getLinkDirection = (linkIn, linkOut) => {
      if(linkIn && linkOut) return "both";
      if(linkIn) return "inbound";
      return "outbound";
    }
    // get non parent nodes + paramenters
    const otherNodes = Array.from(nodeSet).filter((f) => f !== parent);
    const nodeParameters = config.tier1And2Mapper[parent];
    otherNodes.forEach((node) => {
      const currentParameters = config.tier1And2Mapper[node];
      const linkOut = allLinks.some((s) => nodeParameters.includes(s.source)
        && currentParameters.includes(s.target));
      const linkIn = allLinks.some((s) => nodeParameters.includes(s.target)
        && currentParameters.includes(s.source));
      const direction = getLinkDirection(linkIn,linkOut);
      // define links and direction
      if(!acc.some((s) => (s.source === parent && s.target === node) ||
        (s.source === node && s.target === parent))){
        // add if it doesn't exist already
        acc.push({source: parent, target: node, direction});
      }
    })
    return acc;
  },[]);

  const subModuleNames = new Set();
  const segmentNames = new Set();
  // add extra properties and populate submodule + segment sets
  nodesCopy.descendants()
    .map((m) => {
      if(m.depth === 2){
        m.data.parameterCount = m.children.length;
        m.children = undefined;
        m.data.children = undefined;
        segmentNames.add(m.data.id);
      }
      if(m.depth === 1){
        m.data.parameterCount = d3.sum(m.children, (s) => s.children.length);
        subModuleNames.add(m.data.id);
      }
    })
  // get submodule and segment links
  const subModuleLinks = getHierarchyLinks(subModuleNames,config.parameterData.links);
  const segmentLinks = getHierarchyLinks(segmentNames,config.parameterData.links);
  // filter as needed (submodules = depth 1, segments = depth 2)
  const subModuleNodes = nodesCopy.descendants().filter((f) => f.depth === 1).map((m) => m.data);
  const segmentNodes = nodesCopy.descendants().filter((f) => f.depth === 2).map((m) => m.data);
  // set config data
  config.setHierarchyData(
    {submodule: {nodes: subModuleNodes, links: subModuleLinks, nodeNames: Array.from(subModuleNames)},
      segment:{nodes: segmentNodes, links: segmentLinks, nodeNames: Array.from(segmentNames)}})

}

async function getData() {
  try {
    // const params = {
    //   method: "GET",
    //   mode: "cors",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    // };
    config.setInitialLoadComplete(true);
    console.log('call get data')

    console.log('Base URL:', import.meta.env.BASE_URL);
    console.log('Current URL:', window.location.href);

    //const [response1, response2] = await Promise.all([fetch("/api/nodes", params), fetch("/api/edges", params)]);
    const [response1, response2] = await Promise.all([fetch(`${import.meta.env.BASE_URL}assets/nodes.json`), fetch(`${import.meta.env.BASE_URL}assets/edges.json`)]);


    if (!response1.ok || !response2.ok) {
      throw new Error(`HTTP error! Status: ${response1.status} ${response2.status}`);
    }

    const resultNodes = await response1.json();
    const resultEdges = await response2.json();

    if (resultNodes && resultEdges) {
      let resultNodesTrunc = resultNodes.map((d) => {
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
      resultNodesTrunc = dataNullValueCheck(resultNodesTrunc,"SUBMODULE");
      resultNodesTrunc = dataNullValueCheck(resultNodesTrunc,"SEGMENT");
      // selected node names stored in global array (default all selected)
      config.setSelectedNodeNames(resultNodesTrunc.map((m) => m.NAME));
      // as previously, chart always renders with full dataset (stored here);
      config.setParameterData(generateParameterData(resultNodesTrunc,resultEdges));

      // copy selected node names and set config
      const selectedNodeNamesCopy = JSON.parse(JSON.stringify(config.selectedNodeNames));
      config.setAllNodeNames(selectedNodeNamesCopy);

      // get hierarchy from node names
      const treeData = getHierarchy(resultNodesTrunc);
      // mapping submodules and segments to their child nodes (for tree selection)
      config.setTier1And2Mapper(treeData.descendants().filter((f) => f.data.type === "tier3").reduce((acc, entry) => {
        const {subModule, parent, NAME} = entry.data;
        if(!acc[subModule]) {acc[subModule] = []};
        if(!acc[parent]) {acc[parent] = []};
        acc[subModule].push(NAME);
        acc[parent].push(NAME);
        return acc;
      },{}));

      // copy hierarchy data
      const nodesCopy = treeData.copy();
      config.setPackData(getPackData(treeData.copy()));
      // set more config variables
      setHierarchyData(nodesCopy);
      // call the tree
      VariableTree(treeData);
    } else {
      throw new Error("Invalid response format");
    }
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}


// cheat because main.js was calling twice and didn't want to waste your time debugging at this stage
if(!config.initialLoadComplete){
  console.log('loading')
  getData();
}
