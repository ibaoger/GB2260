//
// 数据来源：
//   国家统计局（http://www.stats.gov.cn/tjsj/tjbz/xzqhdm/201504/t20150415_712722.html）
// 吐槽：
//   统计局出的数据格式极其不规范，需要先进行肉眼查找错误，进行修正后，才能程序处理。
// 手动处理：
//   查找包含 连续4个半角空格 的行，把所有空格替换为 3个全角空格
// 手动处理后数据：
//   共 3512行；连续1个全角空格 34个； 连续2个全角空格 345个； 连续3个全角空格 3133个；
// 程序处理后数据：
//   共 3264个；省 35个；市 487个；县 2742个；
//
"use strict";
var fs = require('fs'),
  path = require('path'),
  readline = require('readline'),
  xml2js = require('xml2js'),
  readOptions = {
    flags: 'r',
    mode: 0x1B6,
    autoClose: true
  },
  writeOptions = {
    flag: 'a',
    encoding: 'utf8',
    mode: 0x1B6
  },
  rawFile = './GB2260',
  inFile = rawFile + '.txt', // 处理过的原始数据
  outXmlFile = rawFile + '.xml',
  outJsonFile = rawFile + '.json',
  outSqlFile = rawFile + '.sql',
  code = 0,
  provinceCode = '',
  cityCode = '',
  countyCode = '',
  useCountyReplaceCity = false,
  // 结果存储为 XML 格式
  xmlResult = {},
  // 结果存储为 JSON 格式
  jsonResult = {
    "province": []
  },
  provinceObject = {},
  cityObject = {},
  countyObject = {},
  // 结果存储为 SQL 格式
  sqlResult = "";

if (!fs.existsSync(inFile)) {
  console.log('No input file, I am going to sleep, >_<');
  process.exit(1);
}

// 如果输出文件存在，删除
if (fs.existsSync(outXmlFile)) {
  fs.unlinkSync(outXmlFile);
}
if (fs.existsSync(outJsonFile)) {
  fs.unlinkSync(outJsonFile);
}
if (fs.existsSync(outSqlFile)) {
  fs.unlinkSync(outSqlFile);
}

sqlResult = "";
sqlResult += "CREATE TABLE IF NOT EXISTS `county` (\r\n";
sqlResult += "  `id` int(14) unsigned NOT NULL AUTO_INCREMENT,\r\n";
sqlResult += "  `code` int(14) unsigned NOT NULL COMMENT '行政区划代码',\r\n";
sqlResult += "  `name` varchar(128) CHARACTER SET ucs2 COLLATE ucs2_bin NOT NULL COMMENT '省市县名称',\r\n";
sqlResult += "  `level` int(4) unsigned NOT NULL COMMENT '行政级别 1省 2市 3县',\r\n";
sqlResult += "  `parent` int(14) unsigned NOT NULL COMMENT '父级行政区划代码',\r\n";
sqlResult += "  PRIMARY KEY (`id`),\r\n";
sqlResult += "  UNIQUE KEY `code` (`code`) USING BTREE\r\n";
sqlResult += ") ENGINE=InnoDB  DEFAULT CHARSET=utf8 COMMENT='行政区划代码' AUTO_INCREMENT=1 ;\r\n";
sqlResult += "\r\n";

var xmlBuilder = new xml2js.Builder();
var readStream = fs.createReadStream(inFile, readOptions);
var rl = readline.createInterface({
  input: readStream
});

rl.on('line', function(line) {
  line = doWithLine(line);
  parseGBT(line);
});

rl.on('close', function( /*cmd*/ ) {
  if (provinceObject.name) {
    if (cityObject.name) {
      provinceObject.city.push(cityObject);
    }
    jsonResult.province.push(provinceObject);
  }
  // save as xml
  var xmlResult = '<?xml version="1.0" encoding="utf-8"?>';
  xmlResult += xmlBuilder.buildObject(jsonResult);
  fs.writeFileSync(outXmlFile, xmlResult, writeOptions);
  // save as json
  fs.writeFileSync(outJsonFile, JSON.stringify(jsonResult), writeOptions);
  // save as sql
  fs.writeFileSync(outSqlFile, sqlResult, writeOptions);
  console.log('I got it, ba~ la~ la~ la~');
  rl.close();
});

function parseGBT(line) {
  // GB2260 内容格式
  // GB2260代码	县及县以上行政区划名称
  // 110000[1 space]    北京市
  // 110100[2 space]      市辖区
  // 110101[3 space]        东城区

  if (line.length < 6) {
    console.log('Find error GBT line!');
    return;
  }
  var name = "";
  var level = 0; // 1省  2市  3县
  var parent = 0;
  var lineArr = line.split('　');
  if (2 == lineArr.length) {
    level = 1;
    provinceCode = lineArr[0];
    name = lineArr[1];
    cityCode = 0;
    countyCode = 0;
  } else if (3 == lineArr.length) {
    level = 2;
    cityCode = lineArr[0];
    name = lineArr[2];
    countyCode = 0;
  } else if (4 == lineArr.length) {
    level = 3;
    countyCode = lineArr[0];
    name = lineArr[3];
  } else {
    console.log('Find error GBT line!');
    return;
  }

  // id(uint), code(uint), name(string), level(uint), parent code(uint)
  if (level == 1) {
    code = provinceCode;
    parent = 0;
    useCountyReplaceCity = false;
  }
  // 2、市级名称：
  // 如果是“市辖区”或“县”或“省直辖县级行政区划”或“自治区直辖县级行政区划”，则使用县级的内容替换本级内容；替换后县内容为空；
  else if (level == 2) {
    if (name == "市辖区" || name == "县" || name == "省直辖县级行政区划" || name == "自治区直辖县级行政区划") {
      useCountyReplaceCity = true;
      cityCode = provinceCode;
      return;
    } else {
      useCountyReplaceCity = false;
      code = cityCode;
      parent = provinceCode;
    }
  } else if (level == 3) {
    // 如果是“市辖区”，则不显示；
    if (name == "市辖区") {
      return;
    }
    // 需要提升一个级别
    if (useCountyReplaceCity) {
      level = 2;
    }
    code = countyCode;
    parent = cityCode;
  }

  name = doWithName(name, level, code);
  saveToJson(code, name, level);
  saveToSql(code, name, level, parent);

  // 如果是“东莞”，手动添加县级内容“东莞市”；
  if (name == "东莞") {
    code++;
    level++;
    name = "东莞市";
    saveToJson(code, name, level);
    saveToSql(code, name, level, parent);
  }
  // 如果是“中山”，手动添加县级内容“中山市”；
  if (name == "中山") {
    code++;
    level++;
    name = "中山市";
    saveToJson(code, name, level);
    saveToSql(code, name, level, parent);
  }
}

function saveToSql(code, name, level, parent) {
  sqlResult += "INSERT INTO county VALUES (0,'" + code + "','" + name + "','" + level + "','" + parent + "');\r\n";
}

function saveToJson(code, name, level) {
  // Save result as JSON format
  if (level == 1) {
    if (provinceObject.name) {
      if (cityObject.name) {
        provinceObject.city.push(cityObject);
        cityObject = {};
      }
      jsonResult.province.push(provinceObject);
      provinceObject = {};
    }
    provinceObject.name = name;
    provinceObject.code = code;
    provinceObject.city = [];
  } else if (level == 2) {
    if (cityObject.name) {
      provinceObject.city.push(cityObject);
      cityObject = {};
    }
    cityObject.name = name;
    cityObject.code = code;
    cityObject.county = [];
  } else if (level == 3) {
    countyObject.name = name;
    countyObject.code = code;
    cityObject.county.push(countyObject);
    countyObject = {};
  }
}

//
// 对数据行进行标准化处理
//
function doWithLine(line) {
  return line;
}

//
// 对省市县名称进行标准化处理
//
// 1、省级名称：
// 如果以“省”或“市”或“特别行政区”结尾，则删除“省”或“市”或“特别行政区”；
// 如果是“内蒙古自治区”，则删除“自治区”；
// 如果以“自治区”结尾，则取前两个字；
//
// 2、市级名称：
// 如果是“市辖区”或“县”或“省直辖县级行政区划”或“自治区直辖县级行政区划”，则使用下一级的内容替换本级内容；下一级内容为空；
// 如果以“自治县”结尾，并且是由“省直辖县级行政区划”替换而来（条件简化为 [469000, 469099]），则取该名字的前两个字；
// 如果以“地区”或“林区”结尾，且长度大于等于3，则去掉“地区”或“林区”；（省级名为台湾，香港，澳门除外（条件简化为 [710000, 999999]））
// 如果以“区”或“县"或“市”或“盟”或“地区”结尾，且长度大于等于3，则去掉“区”或“县"或“市”或“盟”或“地区”；（省级名为台湾，香港，澳门除外（条件简化为 [710000, 999999]））
// 如果是“黔西南布依族苗族自治州”或“黔东南苗族侗族自治州”，则取前三个字；
// 如果是“西双版纳傣族自治州”或“博尔塔拉蒙古自治州”或“巴音郭楞蒙古自治州”或“克孜勒苏柯尔克孜自治州”，则取前四个字；
// 如果以”自治州”结尾，则取该名字的前两个字；
// 如果是“东莞”，手动添加县级内容“东莞市”；
// 如果是“中山”，手动添加县级内容“中山市”；
//
// 3、县级名称：
// 如果是“市辖区”，则不显示；
//
function doWithName(name, level, code) {
  var len = name.length;
  // 省级名称
  if (level == 1) {
    // 如果以“省”或“市”结尾
    if (name.charAt(len - 1) == "省" || name.charAt(len - 1) == "市") {
      name = name.substr(0, len - 1);
    }
    // 如果以“特别行政区”结尾
    if (len > 5) {
      if (name.substring(len - 5, len) == "特别行政区") {
        name = name.substring(0, len - 5);
      }
    }
    // 如果是“内蒙古自治区”
    if (name == "内蒙古自治区") {
      name = name.substr(0, 3);
    }
    // 如果以“自治区”结尾
    if (len > 3) {
      if (name.substring(len - 3, len) == "自治区") {
        name = name.substr(0, 2);
      }
    }
  } else if (level == 2) { /*市级名称（处理逻辑有前后关系，不可乱序）*/
    // 如果是“市辖区”或“县”或“省直辖县级行政区划”或“自治区直辖县级行政区划”
    // {  在 parseGBT(line) 中做处理  }
    // 如果以“自治县”结尾，并且是由“省直辖县级行政区划”替换而来（条件简化为 [469000, 469099]）
    if (len > 3) {
      if (name.substring(len - 3, len) == "自治县") {
        if (469000 <= code && code <= 469099) {
          name = name.substr(0, 2);
        }
      }
    }
    // 如果以“地区”或“林区”结尾，且长度大于等于3（省级名为台湾，香港，澳门除外（条件简化为 [110000, 710000)））
    // 如果以“区”或“县"或“市”或“盟”结尾，且长度大于等于3（省级名为台湾，香港，澳门除外（条件简化为 [110000, 710000)））
    if (len >= 3) {
      if (110000 <= code && code < 710000) {
        if (name.substring(len - 2, len) == "地区" || name.substring(len - 2, len) == "林区") {
          name = name.substr(0, len - 2);
        }
        if (name.charAt(len - 1) == "区" || name.charAt(len - 1) == "县" || name.charAt(len - 1) == "市" || name.charAt(len - 1) == "盟") {
          name = name.substr(0, len - 1);
        }
      }
    }
    // 如果是“黔西南布依族苗族自治州”或“黔东南苗族侗族自治州”
    if (name == "黔西南布依族苗族自治州" || name == "黔东南苗族侗族自治州") {
      name = name.substr(0, 3);
    } else if (name == "西双版纳傣族自治州" || name == "博尔塔拉蒙古自治州" || name == "巴音郭楞蒙古自治州" || name == "克孜勒苏柯尔克孜自治州") {
      // 如果是“西双版纳傣族自治州”或“博尔塔拉蒙古自治州”或“巴音郭楞蒙古自治州”或“克孜勒苏柯尔克孜自治州”
      name = name.substr(0, 4);
    }
    // 如果以“自治州”结尾
    if (len > 3) {
      if (name.substring(len - 3, len) == "自治州") {
        name = name.substr(0, 2);
      }
    }
    // 如果是“东莞”“中山”
    // {  在 parseGBT(line) 中做处理  }
  } else if (level == 3) { /*县级名称*/
    // 如果是“市辖区”
    // {  在 parseGBT(line) 中做处理  }
  }
  return name;
}
