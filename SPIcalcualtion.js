



var monthConverter = {
  "JAN" : "1",
  "FEB" : "2",
  "MAR" : "3",
  "APR" : "4",
  "MAY" : "5",
  "SEP" : "9",
  "NOV" : "11",
  "DEC" : "12"
  
}


  //loading study area from asset
  var studyArea=ee.FeatureCollection("users/LearnGEEasim/KRB");
  var resolution=27830
  var showInteractiveChart = true;
  
var calculateSPI = function(){
  //clearing the map before processing
  Map.clear()
  
  var startDate='1998-1-1';
  //study is for timeframe '1998-1-1' to '2019-12-1' but to include last image, end date
  //is extended by 1 month
  var endDate='2020-1-1';
  
  
  //selecting precipitation out of 2 bands in TRMM data and including the images of study timeframe only
  //units of precipitatin is mm/hr
  var precipitation= TRMMdata.select('precipitation');
  print(precipitation);
  var timeFrameData= precipitation.filterDate(startDate,endDate);
  
  
  
  //Extracting time scale(n) from  user input 'SPI-n Month' 
  var spiScaleValue = spiScaleWithMonth.getValue()
  
  //set timestep value= 'n' for n-month SPI
  var timestep = spiScaleValue.split("-")[1].split(" ")[0];
  
  
  var actualMonthString =spiScaleValue.split("-")[1].split(" ")[1];
  var actualMonth = monthConverter[actualMonthString];
  

  //converting the first and last data capture date to 'date' datatype
  var firstImageDate = ee.Date(startDate);
  var lastImageDate=ee.Date(endDate);
  
  //Creating a list of dates of all the images in the TRMM list
  var ImageNumber=timeFrameData.size();
  var list=ee.List.sequence(0,ImageNumber.subtract(1));
  
  var ImageDates=list.map(function(month){
    return firstImageDate.advance(month,'month');
  });
  
  
  //sum n-month images and store in the latter one
  //sum of Nov,Dec and Jan is for month of January
  var summedImage=ImageDates.map(function(date){
    var startTime = ee.Date(date).advance(ee.Number.parse(timestep).subtract(1).multiply(-1), 'month');
    var endTime = ee.Date(date).advance(ee.Number(1),'month');
    var filteredTRMM = precipitation.filterDate(startTime, endTime);
    var clippedTRMM=filteredTRMM.map(function(toclip){
      return toclip.clip(studyArea);
      })
    var sumImage=clippedTRMM.sum().set({
    'Start_Date':ee.Date(filteredTRMM.limit(1, 'system:time_start', false).first().get('system:time_start')),
    'End_Date': ee.Date(filteredTRMM.limit(1, 'system:time_end', false).first().get('system:time_end')),
    'system:time_start':filteredTRMM.limit(1, 'system:time_start', false).first().get('system:time_start'),
    'system:time_end': filteredTRMM.limit(1, 'system:time_end', false).first().get('system:time_end')
    });
  return sumImage;
  })
  
  //print("sumImage",summedImage);
  
  //Image collection from the no of summed images returned by the fucntion
  var sumImageCollection=ee.ImageCollection.fromImages(summedImage);
  //print('imgcollectopn',sumImageCollection);
  //copying the properties of TRMM data to the summed Image Collection
  var summedTRMM=ee.ImageCollection(sumImageCollection.copyProperties(TRMMdata));
  //print('copiedProp',summedTRMM);
  
  
  //Calculation of mean and standard deviation
  var stats = summedTRMM.map(function(toStats){
      var startDOY  = ee.Date(toStats.get('system:time_start')).getRelative('day', 'year');
      var endDOY = ee.Date(toStats.get('system:time_end')).getRelative('day', 'year');
      var collectionForStats = summedTRMM.filter(ee.Filter.calendarRange(startDOY, endDOY, 'day_of_year'))
        .reduce(ee.Reducer.stdDev().combine(ee.Reducer.mean(), null, true));
      return toStats.addBands(collectionForStats);
    });
      
  //Calculate SPI
  var SPI_calc = stats.map(function(toSPI){
    var bandForSPI = toSPI.select(['precipitation'],['SPI']);
    var calc = toSPI.expression('(precipitation - mean) / stdDev',
    {
      precipitation: bandForSPI,
      mean: toSPI.select('precipitation_mean'),
      stdDev: toSPI.select('precipitation_stdDev')});
    return toSPI.addBands(calc);
    });
    
  return SPI_calc;
  }
  
//creating a fucntion to access the returned value of calculateSPI function to access from other methods
function getSPI()
{
  return calculateSPI()
}

var showMap=function(){
  
  var spiScaleValue = spiScaleWithMonth.getValue()
  var timestep = spiScaleValue.split("-")[1].split(" ")[0];
  var actualMonthString =spiScaleValue.split("-")[1].split(" ")[1];
  var actualMonth = monthConverter[actualMonthString];
  
  var year = yearSelector.getValue()
  var fullStartDate = year+"-"+actualMonth+"-"+"01";
  var fullEndDate = year+"-"+actualMonth+"-"+"28";
  
  var SPI_calc=getSPI();
  var SPImonth=SPI_calc.filterDate(fullStartDate,fullEndDate);
  
  
  print(SPImonth)
  var meanSPI=SPImonth.select('SPI').first();
  
  Map.centerObject(studyArea,8);
   
  var palette = ["red", 'yellow', "green"]
  var vis = {min: -2.5, max: 2.5, palette: palette};
  // Display menSPI with defined palette stretched between selected min and max
  Map.addLayer(meanSPI, vis, 'SPI '+timestep);
  
  
  var KRB=ee.Image().paint(studyArea,0,3);
  Map.addLayer(KRB,{'palette':'black'},'KRB' );
  
  Map.addLayer(preci,null,'precipitation stations');
  
  
  var palette = ["red", 'yellow', "green"]
  var vis = {min: -2.5, max: 2.5, palette: palette};
  
  var nSteps = 10
  // Creates a color bar thumbnail image for use in legend from the given color palette
  function makeColorBarParams(palette) {
    return {
      bbox: [0, 0, nSteps, 0.1],
      dimensions: '100x10',
      format: 'png',
      min: 0,
      max: nSteps,
      palette: palette,
    };
  }
  
  // Create the colour bar for the legend
  var colorBar = ui.Thumbnail({
    image: ee.Image.pixelLonLat().select(0).int(),
    params: makeColorBarParams(vis.palette),
    style: {stretch: 'horizontal', margin: '0px 8px', maxHeight: '24px'},
  });
  
  // Create a panel with three numbers for the legend
  var legendLabels = ui.Panel({
    widgets: [
      ui.Label(vis.min, {margin: '4px 8px'}),
      ui.Label(
          ((vis.max-vis.min) / 2+vis.min),
          {margin: '4px 8px', textAlign: 'center', stretch: 'horizontal'}),
      ui.Label(vis.max, {margin: '4px 8px'})
    ],
    layout: ui.Panel.Layout.flow('horizontal')
  });
  
  // Legend title
  var legendTitle = ui.Label({
    value: spiScaleValue+' '+year ,
    style: {fontWeight: 'bold'}
  });
  
  // Add the legendPanel to the map
  var legendPanel = ui.Panel([legendTitle, colorBar, legendLabels]);
  Map.add(legendPanel);
  
 
  // For inspector
  Map.style().set('cursor', 'crosshair');
  var inspectorPanel = ui.Panel({
    style:{
      width: '400px',
      position: 'bottom-right'
    }
  });
  mainPanel.add(inspectorPanel);
  
  // Register a function to draw a chart when a user clicks on the map.
  Map.onClick(function(coords) {
  inspectorPanel.clear();
  var point = ee.FeatureCollection(ee.Geometry.Point(coords.lon, coords.lat)).map(function(addLabels){
    var labelNames = addLabels.set('labelSPI', 'SPI-'+timestep);
  return labelNames;
  });
  
    //Button to hide Panel once the chart is loaded
  var hideButton = ui.Button({
    label: 'Close chart',
    onClick: function(){
      inspectorPanel.clear();
    },
    style:{
      color: 'red',
    }
  });
  inspectorPanel.add(hideButton);
  
  
    //Chart to display data history of clicked point
  var nSPI=ee.ImageCollection(SPI_calc)
  var inputMonth= ee.Number.parse(actualMonth)
  var nSPIselectedMonth=nSPI.filter(ee.Filter.calendarRange(inputMonth,inputMonth , 'month'))
  
  
  var inspectorChart = ui.Chart.image.seriesByRegion(
  nSPIselectedMonth, 
  point, 
  ee.Reducer.mean(),
  'SPI', 
  resolution, //Scale in meter
  'system:time_start', 
  'labelSPI' //label
  ).setOptions({
    title: 'SPI-'+timestep+' Time Series (based on CHIRPS)',
    vAxis: {title: 'SPI'},
    hAxis: {title: 'Year'},
    //legend: {position: 'none'},
    });
  inspectorChart.setOptions({title: 'SPI-'+timestep+' for requested location'});
  inspectorPanel.add(inspectorChart);
  });

}

// ----------------------------------------------------------------------------------//
// Panels are the main container widgets
var mainPanel = ui.Panel({
  style: {width: '300px'
  }
  
});


var title = ui.Label({
  value: 'Drought Monitoring',
  style: {'fontSize': '24px'}
});
// You can add widgets to the panel
mainPanel.add(title)

// You can even add panels to other panels
var dropdownPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'),
});
mainPanel.add(dropdownPanel);

var yearSelector = ui.Select({
  placeholder: 'Please wait..',
  })

var spiScaleWithMonth = ui.Select({
  placeholder: 'Please wait..',
  })

var button1=ui.Button('Calculate')
var button2 = ui.Button('Load')

dropdownPanel.add(spiScaleWithMonth)
dropdownPanel.add(button1)

dropdownPanel.add(yearSelector)
dropdownPanel.add(button2)


// Let's add a dropdown with the years
var years = ee.List.sequence(1998, 2019)
var spiScale = ee.List(["SPI-3 FEB","SPI-3 MAY","SPI-4 SEP ","SPI-2 NOV", "SPI-12 DEC"])

// Dropdown items need to be strings
var yearStrings = years.map(function(year){
  return ee.Number(year).format('%04d')
})
var monthStrings = spiScale.map(function(month){
  return ee.String(month)
})

// Evaluate the results and populate the dropdown
yearStrings.evaluate(function(yearList) {
  yearSelector.items().reset(yearList)
  yearSelector.setPlaceholder('select a year')
})

monthStrings.evaluate(function(monthList) {
  spiScaleWithMonth.items().reset(monthList)
  spiScaleWithMonth.setPlaceholder('Select n-month SPI')

})

button1.onClick(calculateSPI)
button2.onClick(showMap)

ui.root.add(mainPanel);
