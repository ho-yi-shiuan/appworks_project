const fs = require('fs');
const AWS = require('aws-sdk');
var mysql = require("../mysqlcon.js");
var express = require("express");
var multer  = require('multer');
var multerS3 = require('multer-s3');
var bodyparser = require('body-parser');
var app = express();
app.use('/public',express.static('public'));

AWS.config.loadFromPath('./s3_config.json');
const s3 = new AWS.S3();

var upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'yssites.com/person_project/lost_pet',
	contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      cb(null, Date.now()+file.originalname);// 檔案命名要重新想!!!!是否綁room id?? 這樣前端比較好叫
    }
  })
})

app.post('/', upload.single('image'), async function(req, res){
	console.log(req.body);
	//待辦:
	//是否要做transaction?
	var lost_data_id;
	var lost_data;
	if(req.body.post_type == "lost"){
		lost_data = {
			category: req.body.category,
			pet_name: req.body.pet_name,
			pet_picture: req.file.key,
			gender: req.body.pet_gender,
			age: req.body.pet_age,
			breed: req.body.pet_breed,
			color: req.body.pet_color,
			lost_location: req.body.input_address,
			lost_location_lng: req.body.lost_address_lng,
			lost_location_lat: req.body.lost_address_lat,
			lost_time: req.body.lost_time,
			other: req.body.other,
			user_id: req.body.user_id,
			lost_status: "finding",
			post_type: req.body.post_type
		}		
	}else if(req.body.post_type == "find"){
		lost_data = {
			category: req.body.category,
			pet_picture: req.file.key,
			gender: req.body.pet_gender,
			age: req.body.pet_age,
			breed: req.body.pet_breed,
			color: req.body.pet_color,
			lost_location: req.body.input_address,
			lost_location_lng: req.body.lost_address_lng,
			lost_location_lat: req.body.lost_address_lat,
			lost_time: req.body.lost_time,
			other: req.body.other,
			user_id: req.body.user_id,
			lost_status: "finding",
			post_type: req.body.post_type
		}			
	}
	const insert_lost_pet_promise = new Promise((resolve, reject) => {
		mysql.con.query("INSERT INTO lost_pet set?",lost_data,function(err, result){
			if(err){
				console.log("lost_record api(post): \n");
				console.log(err);
			}
			else
			{
				resolve(result);
				lost_data_id = result.isertId;
				console.log("lost_record api: db新增走失紀錄成功");
			}
		});
	})
	const insert_lost_pet = await insert_lost_pet_promise;
	var create_chat_table = "CREATE TABLE socket"+insert_lost_pet.insertId+"(id bigint(20) NOT NULL AUTO_INCREMENT, name varchar(45) DEFAULT NULL, content varchar(45) DEFAULT NULL, content_type varchar(20), time bigint(20) DEFAULT NULL, PRIMARY KEY (id));";
	mysql.con.query(create_chat_table,function(err, result){
		if(err){
			console.log("lost_record api(post, create chat table): \n");
			console.log(err);
		}
		else
		{
			console.log("lost_record api: db新增聊天室table成功");
			res.redirect("/");
		}
	});	
	
	//要改成只有選擇post lost的時候才做 //要測試
	if(req.body.post_type == "lost"){
		var select_mark = "SELECT user_id from user_mark WHERE location_lng BETWEEN "+req.body.lost_address_lng+"-0.05 AND "+req.body.lost_address_lng+"+0.05 AND location_lat BETWEEN "+req.body.lost_address_lat+"-0.05 AND "+req.body.lost_address_lat+"+0.05;";
		const mark_promise = new Promise((resolve, reject) => {
			mysql.con.query(select_mark, function(err, result){
				if(err){
					console.log("lost_record api(mark): \n");
					console.log(err);
				}else{
					console.log("找出經緯度±0.1的會員成功");
					resolve(result);
				}
			});
		})	
		let near_user = await mark_promise;	
		let near_user_array = [];
		for(j=0; j<near_user.length; j++){
			//篩掉重複的user_id
			//insert message
			near_user_array.push(near_user[j].user_id);
		}
		console.log("array: "+near_user_array);
		var result = near_user_array.filter(function(element, index, arr){
			return arr.indexOf(element)=== index;
		});
		console.log(result);
		for(k=0; k<result.length; k++){
			if(result[k] != req.body.user_id){
				var insert_message = {
					send_id: 0,
					send_time: Date.now(),
					receive_id: result[k],
					content: "有寵物在您附近走失, 請點訊息前往",
					link_id: insert_lost_pet.insertId
				}
				mysql.con.query("INSERT INTO message set?", insert_message, function(err, result){
					if(err){
						console.log("lost_record api(mark): \n");
						console.log(err);
					}else{
						console.log("找出經緯度±0.1的會員成功");
					}
				});					
			}
		}		
	}else if(req.body.post_type == "find"){
		//文字比對
		var compare_query = "SELECT * from lost_pet WHERE post_type (in)";
		var compare_array = [['lost']];
		var condition_array = [];
		if(req.body.category.length > 0){
			let category_query = "category (in)";
			compare_array = [category_query,[req.body.category]];
			condition_array.push(compare_array);
		}
		if(req.body.pet_gender.length > 0){
			let gender_query = "gender (in)";
			gender_array = [gender_query,[req.body.pet_gender]];
			condition_array.push(gender_array);
		}
		if(req.body.pet_breed.length > 0){
			let pet_breed_query = "breed (in)";
			pet_breed_array = [pet_breed_query,[req.body.pet_breed]];
			condition_array.push(pet_breed_array);
		
		}
		console.log(condition_array);
		//顏色
		//以空格跟逗號拆解
		if(req.body.pet_color.length > 0){
			var color_array = req.body.pet_color.split(/[ ,]+/);
			console.log(color_array);
			//去掉顏色中的色, 才能做LIKE
			for(i=0; i<color_array.length; i++){
				
			}
			//組成LIKE
		}
		
		//位置
		
	}
});

app.get('/', async function(req, res){
	console.log(req.query);
	//篩選類別, 品種, 性別
	var select_array = [];
	var query_array = [];
	var condition_array = [];
	if(typeof(req.query.post_type) == "object"){
		let post_type_query = " post_type in (?)";
		condition_array.push(req.query.post_type);
		select_array.push(post_type_query);
	}else if(typeof(req.query.post_type) == "string"){
		let post_type_query = " post_type in (?)";
		condition_array.push([req.query.post_type]);
		select_array.push(post_type_query);
	}
	if(typeof(req.query.select_category) == "object"){
		let category_query = " category in (?)";
		condition_array.push(req.query.select_category);
		select_array.push(category_query);
	}else if(typeof(req.query.select_category) == "string"){
		let category_query = " category in (?)";
		condition_array.push([req.query.select_category]);
		select_array.push(category_query);
	}
	if(typeof(req.query.select_breed) == "object"){
		let breed_query = " breed in (?)";
		condition_array.push(req.query.select_breed);
		select_array.push(breed_query);
	}else if(typeof(req.query.select_breed) == "string"){
		let breed_query = " breed in (?)";
		condition_array.push([req.query.select_breed]);
		select_array.push(breed_query);
	}
	if(typeof(req.query.select_gender) == "object"){
		let gender_query = " gender in (?)";
		condition_array.push(req.query.select_gender);
		select_array.push(gender_query);
	}else if(typeof(req.query.select_gender) == "string"){
		let gender_query = " gender in (?)";
		condition_array.push([req.query.select_gender]);
		select_array.push(gender_query);
	}
	//地址篩經緯度
	if(req.query.lost_address_lng){
		select_array.push(" lost_location_lng BETWEEN "+req.query.lost_address_lng+"-0.05 AND "+req.query.lost_address_lng+"+0.05 AND lost_location_lat BETWEEN "+req.query.lost_address_lat+"-0.05 AND "+req.query.lost_address_lat+"+0.05");
	}
	//顏色where color like '%黑%' OR '%白%'
	if(typeof(req.query.select_color) == "object"){
		var color_query = "";
		color_query += " (";
		var color_query;
		for(j=0; j<req.query.select_color.length; j++){
			color_query += "color LIKE '%"+req.query.select_color[j]+"%'";
			if(j <req.query.select_color.length-1){
				color_query += " OR ";
			}
		}
		color_query += ")";
		select_array.push(color_query);
		console.log(color_query);
	}else if(typeof(req.query.select_color) == "string"){
		select_array.push(" color LIKE '%"+req.query.select_color+"%'");
	}	
	
	var select_query = "SELECT * from lost_pet ";
	if(select_array.length >0){
		select_query += "where";
		for(i=0; i<select_array.length; i++){
			select_query += select_array[i];
			if(i < select_array.length-1){
				select_query += " AND";
			}
		}
	}
	console.log(select_query);
	console.log(condition_array);
	const lost_record_promise = new Promise((resolve, reject) => {
	mysql.con.query(select_query, condition_array, function(err, result){
			if(err){
				console.log("lost_record api(get): \n");
				console.log(err);
			}else{
				resolve(result);
			}
		});
	})
	let lost_record = await lost_record_promise;
	var picture_s3_url = "https://d2h10qrqll8k7g.cloudfront.net/person_project/lost_pet/";
	var lost_record_array = [];
	for(i=0; i<lost_record.length; i++){
		var lost_data_object = {
			id: lost_record[i].pet_id,
			name: lost_record[i].pet_name,
			picture: picture_s3_url+lost_record[i].pet_picture,
			gender: lost_record[i].gender,
			age: lost_record[i].age,
			breed: lost_record[i].breed,
			color: lost_record[i].color,
			lost_location: lost_record[i].lost_location,
			lost_time: lost_record[i].lost_time,
			other: lost_record[i].other,
			lost_status: lost_record[i].lost_status,
			post_type: lost_record[i].post_type
		}
		lost_record_array.push(lost_data_object);
	};
	var data = {
		data:lost_record_array
	}
	res.json(data);
});
	
module.exports = app;