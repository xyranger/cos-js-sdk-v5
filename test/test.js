var config = {
    Bucket: 'test-1250000000',
    Region: 'ap-guangzhou'
};

var util = {
    createFile: function (options) {
        var buffer = new ArrayBuffer(options.size || 0);
        var arr = new Uint8Array(buffer);
        arr.forEach(function (char, i) {
            arr[i] = 0;
        });
        var opt = {};
        options.type && (opt.type = options.type);
        var blob = new Blob([buffer], options);
        return blob;
    },
    str2blob: function (str) {
        var size = str.length;
        var buffer = new ArrayBuffer(size || 0);
        var arr = new Uint8Array(buffer);
        arr.forEach(function (char, i) {
            arr[i] = str[i];
        });
        var blob = new Blob([buffer]);
        return blob;
    }
};

var getAuthorization = function (options, callback) {

    // 方法一、后端通过获取临时密钥，计算签名给到前端（适用于前端调试）
    // var url = 'http://127.0.0.1:3000/sts?Bucket=' + options.Bucket + '&Region=' + options.Region;
    // var url = '../server/sts.php?Bucket=' + options.Bucket + '&Region=' + options.Region;
    var url = '../server/sts.php';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function (e) {
        try {
            var data = JSON.parse(e.target.responseText);
        } catch (e) {
        }
        callback({
            TmpSecretId: data.credentials && data.credentials.tmpSecretId,
            TmpSecretKey: data.credentials && data.credentials.tmpSecretKey,
            XCosSecurityToken: data.credentials && data.credentials.sessionToken,
            ExpiredTime: data.expiredTime,
        });
    };
    xhr.send();


    // // 方法二、后端通过获取临时密钥，计算签名给到前端（适用于前端调试）
    // var method = (options.Method || 'get').toLowerCase();
    // var key = options.Key || '';
    // var query = options.Query || {};
    // var headers = options.Headers || {};
    // var pathname = key.indexOf('/') === 0 ? key : '/' + key;
    // // var url = 'http://127.0.0.1:3000/sts-auth';
    // var url = '../server/sts-auth.php';
    // var xhr = new XMLHttpRequest();
    // var data = {
    //     method: method,
    //     pathname: pathname,
    //     query: query,
    //     headers: headers,
    // };
    // xhr.open('POST', url, true);
    // xhr.setRequestHeader('content-type', 'application/json');
    // xhr.onload = function (e) {
    //     try {
    //         var AuthData = JSON.parse(e.target.responseText);
    //     } catch (e) {
    //     }
    //     callback({
    //         Authorization: AuthData.Authorization,
    //         XCosSecurityToken: AuthData.XCosSecurityToken,
    //     });
    // };
    // xhr.send(JSON.stringify(data));


    // // 方法三、前端计算签名（适用于前端调试）
    // var authorization = COS.getAuthorization({
    //     SecretId: 'AKIDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    //     SecretKey: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    //     Method: options.Method,
    //     Key: options.Key,
    // });
    // callback(authorization);

};

var cos = new COS({
    // 必选参数
    getAuthorization: getAuthorization,
    // 可选参数
    FileParallelLimit: 3,    // 控制文件上传并发数
    ChunkParallelLimit: 3,   // 控制单个文件下分片上传并发数
    ChunkSize: 1024 * 1024,  // 控制分片大小，单位 B
    ProgressInterval: 1,  // 控制 onProgress 回调的间隔
});

var AppId = config.AppId;
var Bucket = config.Bucket;
var BucketShortName = Bucket;
var BucketLongName = Bucket + '-' + AppId;
var TaskId;

var match = config.Bucket.match(/^(.+)-(\d+)$/);
if (match) {
    BucketLongName = config.Bucket; // Bucket 格式：test-1250000000
    BucketShortName = match[1];
    AppId = match[2];
}

var it = QUnit.test;
function comparePlainObject(a, b) {
    if (Object.keys(a).length !== Object.keys(b).length) {
        return false;
    }
    for (var key in a) {
        if (typeof a[key] === 'object' && typeof b[key] === 'object') {
            if (!comparePlainObject(a[key], b[key])) {
                return false;
            }
        } else if (a[key] != b[key]) {
            return false;
        }
    }
    return true;
}

it('getAuth()', function (assert) {
    return new Promise(function (done) {
        var content = Date.now().toString();
        var key = '1.txt';
        cos.putObject({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: key,
            Body: content
        }, function (err, data) {
            cos.getObjectUrl({
                Bucket: config.Bucket,
                Region: config.Region,
                Key: key,
            }, function (err, data) {
                var link = data.Url;
                var xhr = new XMLHttpRequest();
                xhr.open('GET', link, true);
                data.XCosSecurityToken && xhr.setRequestHeader('x-cos-security-token', data.XCosSecurityToken);
                xhr.onload = function (e) {
                    assert.ok(xhr.status === 200, '获取文件 200');
                    assert.ok(xhr.responseText === content, '通过获取签名能正常获取文件');
                    done();
                };
                xhr.onerror = function (e) {
                    assert.ok(false, '文件获取出错');
                    done();
                };
                xhr.send();
            });
        });
    });
});

it('auth check', function (assert) {
    return new Promise(function (done) {
        cos.getBucketCors({
            Bucket: config.Bucket,
            Region: config.Region,
            Headers: {
                'x-cos-test': 'aksjhdlash sajlhj!@#$%^&*()_+=-[]{}\';:\"/.<>?.,??sadasd#/.,/~`',
            },
        }, function (err, data) {
            assert.ok(!err);
            done();
        });
    });
});

it('cancelTask()', function (assert) {
    return new Promise(function (done) {
        var filename = '10mb.zip';
        var blob = util.createFile({size: 1024 * 1024 * 10});
        var alive = false;
        var canceled = false;
        cos.putObject({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: filename,
            Body: blob,
            TaskReady: function (taskId) {
                TaskId = taskId;
            },
            onProgress: function (info) {
                alive = true;
                if (!canceled) {
                    cos.cancelTask(TaskId);
                    alive = false;
                    canceled = true;
                    setTimeout(function () {
                        assert.ok(!alive, '取消上传已经生效');
                        done();
                    }, 1200);
                }
            }
        }, function (err, data) {
            alive = true;
        });
    });
});

it('pauseTask(),restartTask()', function (assert) {
    return new Promise(function (done) {
        var filename = '10mb.zip';
        var blob = util.createFile({size: 1024 * 1024 * 10});
        var paused = false;
        var restarted = false;
        cos.abortUploadTask({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: filename,
            Level: 'file',
        }, function (err, data) {
            cos.sliceUploadFile({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                Key: filename,
                Body: blob,
                TaskReady: function (taskId) {
                    TaskId = taskId;
                },
                onProgress: function (info) {
                    if (!paused && info.percent > 0.6) {
                        cos.pauseTask(TaskId);
                        paused = true;
                        setTimeout(function () {
                            cos.restartTask(TaskId);
                            restarted = true;
                        }, 1000);
                    }
                    if (restarted) {
                        assert.ok(info.percent > 0.3, '暂停和重试成功');
                        done();
                    }
                }
            }, function (err, data) {
            });
        });
    });
});

it('分片上传', function (assert) {
    return new Promise(function (done) {
        var filename = '10mb.zip';
        var blob = util.createFile({size: 1024 * 1024 * 10});
        var paused = false;
        cos.abortUploadTask({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: filename,
            Level: 'file',
        }, function (err, data) {
            cos.sliceUploadFile({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                Key: filename,
                Body: blob,
                TaskReady: function (taskId) {
                    TaskId = taskId;
                },
                onProgress: function (info) {
                    if (!paused && info.percent >= 0.6) {
                        paused = true;
                        cos.cancelTask(TaskId);
                        cos.sliceUploadFile({
                            Bucket: config.Bucket, // Bucket 格式：test-1250000000
                            Region: config.Region,
                            Key: filename,
                            Body: blob,
                            TaskReady: function (taskId) {
                                TaskId = taskId;
                            },
                            onProgress: function (info) {
                                assert.ok(info.percent > 0.3, '分片续传成功');
                                cos.cancelTask(TaskId);
                                done();
                            }
                        });
                    }
                }
            });
        });
    });
});

it('mock readAsBinaryString', function (assert) {
    return new Promise(function (done) {
        FileReader.prototype._readAsBinaryString = FileReader.prototype.readAsBinaryString;
        FileReader.prototype.readAsBinaryString = false;
        var filename = '10mb.zip';
        var blob = util.createFile({size: 1024 * 1024 * 10});
        var paused = false;
        cos.sliceUploadFile({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: filename,
            Body: blob,
            TaskReady: function (taskId) {
                TaskId = taskId;
            },
            onProgress: function (info) {
                if (!paused && info.percent > 0.6) {
                    cos.cancelTask(TaskId);
                    cos.sliceUploadFile({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region,
                        Key: filename,
                        Body: blob,
                        TaskReady: function (taskId) {
                            TaskId = taskId;
                        },
                        onProgress: function (info) {
                            assert.ok(info.percent > 0.3, '分片续传成功');
                            cos.cancelTask(TaskId);
                            FileReader.prototype.readAsBinaryString = FileReader.prototype._readAsBinaryString;
                            delete FileReader.prototype._readAsBinaryString;
                            done();
                        }
                    });
                }
            }
        });
    });
});


it('abortUploadTask(),Level=task', function (assert) {
    return new Promise(function (done) {
        var filename = '10mb.zip';
        cos.multipartInit({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: filename,
        }, function (err, data) {
            cos.abortUploadTask({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                Key: filename,
                Level: 'task',
                UploadId: data.UploadId,
            }, function (err, data) {
                var nameExist = false;
                data.successList.forEach(function (item) {
                    if (filename === item.Key) {
                        nameExist = true;
                    }
                });
                assert.ok(data.successList.length >= 1, '成功取消单个分片任务');
                assert.ok(nameExist, '成功取消单个分片任务');
                done();
            });
        });
    });
});

it('abortUploadTask(),Level=file', function (assert) {
    return new Promise(function (done) {
        var filename = '10mb.zip';
        var blob = util.createFile({size: 1024 * 1024 * 10});
        cos.sliceUploadFile({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: filename,
            Body: blob,
            TaskReady: function (taskId) {
                TaskId = taskId;
            },
            onProgress: function (info) {
                cos.cancelTask(TaskId);
                cos.abortUploadTask({
                    Bucket: config.Bucket, // Bucket 格式：test-1250000000
                    Region: config.Region,
                    Level: 'file',
                    Key: filename,
                }, function (err, data) {
                    assert.ok(data.successList.length >= 1, '成功舍弃单个文件下的所有分片任务');
                    assert.ok(data.successList[0].Key === filename, '成功舍弃单个文件的所有分片任务');
                    done();
                });
            }
        });
    });
});

it('abortUploadTask(),Level=bucket', function (assert) {
    return new Promise(function (done) {
        var filename = '10mb.zip';
        var blob = util.createFile({size: 1024 * 1024 * 10});
        cos.sliceUploadFile({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: filename,
            Body: blob,
            TaskReady: function (taskId) {
                TaskId = taskId;
            },
            onProgress: function (info) {
                cos.cancelTask(TaskId);
                cos.abortUploadTask({
                    Bucket: config.Bucket, // Bucket 格式：test-1250000000
                    Region: config.Region,
                    Level: 'bucket',
                }, function (err, data) {
                    var nameExist = false;
                    data.successList.forEach(function (item) {
                        if (filename === item.Key) {
                            nameExist = true;
                        }
                    });
                    assert.ok(data.successList.length >= 1, '成功舍弃Bucket下所有分片任务');
                    assert.ok(nameExist, '成功舍弃Bucket下所有分片任务');
                    done();
                });
            }
        });
    });
});

it('headBucket()', function (assert) {
    return new Promise(function (done) {
        cos.headBucket({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region
        }, function (err, data) {
            assert.ok(data, '正常获取 head bucket');
            done();
        });
    });
});

it('headBucket() not exist', function (assert) {
    return new Promise(function (done) {
        cos.headBucket({
            Bucket: config.Bucket + Date.now().toString(36),
            Region: config.Region
        }, function (err, data) {
            assert.ok(err, 'bucket 不存在');
            done();
        });
    });
});

it('deleteBucket()', function (assert) {
    return new Promise(function (done) {
        cos.deleteBucket({
            Bucket: config.Bucket + Date.now().toString(36),
            Region: config.Region
        }, function (err, data) {
            assert.ok(err, '正常获取 head bucket');
            done();
        });
    });
});

it('getBucket()', function (assert) {
    return new Promise(function (done) {
        cos.getBucket({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region
        }, function (err, data) {
            assert.equal(true, data.Name === BucketLongName, '能列出 bucket');
            assert.equal(data.Contents.constructor, Array, '正常获取 bucket 里的文件列表');
            done();
        });
    });
});

it('putObject()', function (assert) {
    var filename = '1.txt';
    var getObjectETag = function (callback) {
        setTimeout(function () {
            cos.headObject({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                Key: filename,
            }, function (err, data) {
                callback(data && data.headers && data.headers.etag);
            });
        }, 2000);
    };
    return new Promise(function (done) {
        var content = Date.now().toString();
        var lastPercent = 0;
        var blob = util.str2blob(content);
        cos.putObject({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: filename,
            Body: blob,
            onProgress: function (processData) {
                lastPercent = processData.percent;
            },
        }, function (err, data) {
            if (err) throw err;
            assert.ok(data.ETag.length > 0, 'putObject 有返回 ETag');
            getObjectETag(function (ETag) {
                assert.ok(data.ETag === ETag, 'Blob 创建 object');
                done();
            });
        });
    });
});

it('Key 特殊字符', function (assert) {
    return new Promise(function (done) {
        cos.putObject({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: '(!\'*) "#$%&+,-./0123456789:;<=>@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~',
            Body: Date.now().toString()
        }, function (err, data) {
            if (err) throw err;
            assert.ok(data, 'putObject 特殊字符的 Key 能通过');
            done();
        });
    });
});

it('getObject()', function (assert) {
    return new Promise(function (done) {
        var key = '1.txt';
        var content = Date.now().toString(36);
        cos.putObject({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: key,
            Body: content
        }, function (err, data) {
            setTimeout(function () {
                cos.getObject({
                    Bucket: config.Bucket, // Bucket 格式：test-1250000000
                    Region: config.Region,
                    Key: key,
                }, function (err, data) {
                    if (err) throw err;
                    assert.ok(data.Body === content);
                    done();
                });
            }, 2000);
        });
    });
});

it('putObjectCopy()', function (assert) {
    return new Promise(function (done) {
        var content = Date.now().toString(36);
        cos.putObject({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: '1.txt',
            Body: content,
        }, function (err, data) {
            var ETag = data.ETag;
            cos.deleteObject({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                Key: '1.copy.txt',
            }, function (err, data) {
                cos.putObjectCopy({
                    Bucket: config.Bucket, // Bucket 格式：test-1250000000
                    Region: config.Region,
                    Key: '1.copy.txt',
                    CopySource: BucketLongName + '.cos.' + config.Region + '.myqcloud.com/1.txt',
                }, function (err, data) {
                    cos.headObject({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region,
                        Key: '1.copy.txt',
                    }, function (err, data) {
                        assert.ok(data.headers.etag === ETag, '成功复制文件');
                        done();
                    });
                });
            });
        });
    });
});

it('deleteMultipleObject()', function (assert) {
    return new Promise(function (done) {
        var content = Date.now().toString(36);
        cos.putObject({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: '1.txt',
            Body: content,
        }, function (err, data) {
            cos.putObject({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                Key: '2.txt',
                Body: content,
            }, function (err, data) {
                cos.deleteMultipleObject({
                    Bucket: config.Bucket, // Bucket 格式：test-1250000000
                    Region: config.Region,
                    Objects : [
                        {Key: '1.txt'},
                        {Key: '2.txt'}
                    ],
                }, function (err, data) {
                    assert.ok(data.Deleted.length === 2);
                    cos.headObject({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region,
                        Key: '1.txt',
                    }, function (err, data) {
                        assert.ok(err.statusCode === 404, '1.txt 删除成功');
                        cos.headObject({
                            Bucket: config.Bucket, // Bucket 格式：test-1250000000
                            Region: config.Region,
                            Key: '2.txt',
                        }, function (err, data) {
                            assert.ok(err.statusCode === 404, '2.txt 删除成功');
                            done();
                        });
                    });
                });
            });
        });
    });
});

it('sliceUploadFile()', function (assert) {
    return new Promise(function (done) {
        var filename = '3mb.zip';
        var blob = util.createFile({size: 1024 * 1024 * 3});
        var lastPercent = 0;
        cos.sliceUploadFile({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: filename,
            Body: blob,
            SliceSize: 1024 * 1024,
            AsyncLimit: 5,
            onHashProgress: function (progressData) {
            },
            onProgress: function (progressData) {
                lastPercent = progressData.percent;
            },
        }, function (err, data) {
            assert.ok(data.ETag.length > 0 && lastPercent === 1, '上传成功');
            done();
        });
    });
});

(function () {
    var AccessControlPolicy = {
        "Owner": {
            "ID": 'qcs::cam::uin/10001:uin/10001' // 10001 是 QQ 号
        },
        "Grants": [{
            "Grantee": {
                "ID": "qcs::cam::uin/10002:uin/10002", // 10002 是 QQ 号
            },
            "Permission": "READ"
        }]
    };
    var AccessControlPolicy2 = {
        "Owner": {
            "ID": 'qcs::cam::uin/10001:uin/10001' // 10001 是 QQ 号
        },
        "Grant": {
            "Grantee": {
                "ID": "qcs::cam::uin/10002:uin/10002", // 10002 是 QQ 号
            },
            "Permission": "READ"
        }
    };
    it('putBucketAcl() header ACL:private', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                ACL: 'private'
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({
                    Bucket: config.Bucket, // Bucket 格式：test-1250000000
                    Region: config.Region
                }, function (err, data) {
                    AccessControlPolicy.Owner.ID = data.Owner.ID;
                    AccessControlPolicy2.Owner.ID = data.Owner.ID;
                    assert.ok(data.ACL === 'private' || data.ACL === 'default');
                    done();
                });
            });
        });
    });
    it('putBucketAcl() header ACL:public-read', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                ACL: 'public-read',
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.ACL === 'public-read');
                    done();
                });
            });
        });
    });
    it('putBucketAcl() header ACL:public-read-write', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                ACL: 'public-read-write',
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.ACL === 'public-read-write');
                    done();
                });
            });
        });
    });
    it('putBucketAcl() header GrantRead:1001,1002"', function (assert) {
        return new Promise(function (done) {
            var GrantRead = 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"';
            cos.putBucketAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                GrantRead: GrantRead,
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.GrantRead = GrantRead);
                    done();
                });
            });
        });
    });
    it('putBucketAcl() header GrantWrite:1001,1002', function (assert) {
        return new Promise(function (done) {
            var GrantWrite = 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"';
            cos.putBucketAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                GrantWrite: GrantWrite,
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.GrantWrite = GrantWrite);
                    done();
                });
            });
        });
    });
    it('putBucketAcl() header GrantFullControl:1001,1002', function (assert) {
        return new Promise(function (done) {
            var GrantFullControl = 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"';
            cos.putBucketAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                GrantFullControl: GrantFullControl,
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.GrantFullControl = GrantFullControl);
                    done();
                });
            });
        });
    });
    it('putBucketAcl() header ACL:public-read, GrantFullControl:1001,1002', function (assert) {
        return new Promise(function (done) {
            var GrantFullControl = 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"';
            cos.putBucketAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                GrantFullControl: GrantFullControl,
                ACL: 'public-read',
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.GrantFullControl = GrantFullControl);
                    assert.ok(data.ACL === 'public-read');
                    done();
                });
            });
        });
    });
    it('putBucketAcl() xml', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                AccessControlPolicy: AccessControlPolicy
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.Grants.length === 1);
                    assert.ok(data.Grants[0] && data.Grants[0].Grantee.ID === 'qcs::cam::uin/10002:uin/10002', '设置 AccessControlPolicy ID 正确');
                    assert.ok(data.Grants[0] && data.Grants[0].Permission === 'READ', '设置 AccessControlPolicy Permission 正确');
                    done();
                });
            });
        });
    });
    it('putBucketAcl() xml2', function (assert) {
        return new Promise(function (done) {
            cos.putBucketAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                AccessControlPolicy: AccessControlPolicy2,
            }, function (err, data) {
                assert.ok(!err, 'putBucketAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.Grants.length === 1);
                    assert.ok(data.Grants[0] && data.Grants[0].Grantee.ID === 'qcs::cam::uin/10002:uin/10002');
                    assert.ok(data.Grants[0] && data.Grants[0].Permission === 'READ');
                    done();
                });
            });
        });
    });
    it('putBucketAcl() decodeAcl', function (assert) {
        return new Promise(function (done) {
            cos.getBucketAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region
            }, function (err, data) {
                cos.putBucketAcl({
                    Bucket: config.Bucket, // Bucket 格式：test-1250000000
                    Region: config.Region,
                    GrantFullControl: data.GrantFullControl,
                    GrantWrite: data.GrantWrite,
                    GrantRead: data.GrantRead,
                    ACL: data.ACL,
                }, function (err, data) {
                    assert.ok(data);
                    done();
                });
            });
        });
    });
})();

(function () {
    var AccessControlPolicy = {
        "Owner": {
            "ID": 'qcs::cam::uin/10001:uin/10001' // 10001 是 QQ 号
        },
        "Grants": [{
            "Grantee": {
                "ID": "qcs::cam::uin/10002:uin/10002", // 10002 是 QQ 号
            },
            "Permission": "READ"
        }]
    };
    var AccessControlPolicy2 = {
        "Owner": {
            "ID": 'qcs::cam::uin/10001:uin/10001' // 10001 是 QQ 号
        },
        "Grant": {
            "Grantee": {
                "ID": "qcs::cam::uin/10002:uin/10002", // 10002 是 QQ 号
            },
            "Permission": "READ"
        }
    };
    it('putObjectAcl() header ACL:private', function (assert) {
        return new Promise(function (done) {
            cos.putObject({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                Key: '1.txt',
                Body: util.str2blob('hello!'),
            }, function (err, data) {
                assert.ok(!err);
                cos.putObjectAcl({
                    Bucket: config.Bucket, // Bucket 格式：test-1250000000
                    Region: config.Region,
                    ACL: 'private',
                    Key: '1.txt',
                }, function (err, data) {
                    assert.ok(!err, 'putObjectAcl 成功');
                    cos.getObjectAcl({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region,
                        Key: '1.txt'
                    }, function (err, data) {
                        assert.ok(data.ACL = 'private');
                        AccessControlPolicy.Owner.ID = data.Owner.ID;
                        AccessControlPolicy2.Owner.ID = data.Owner.ID;
                        assert.ok(data.Grants.length === 1);
                        done();
                    });
                });
            });
        });
    });
    it('putObjectAcl() header ACL:default', function (assert) {
        return new Promise(function (done) {
            cos.putObjectAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                ACL: 'default',
                Key: '1.txt',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({
                    Bucket: config.Bucket, // Bucket 格式：test-1250000000
                    Region: config.Region,
                    Key: '1.txt'
                }, function (err, data) {
                    assert.ok(data.ACL = 'default');
                    done();
                });
            });
        });
    });
    it('putObjectAcl() header ACL:public-read', function (assert) {
        return new Promise(function (done) {
            cos.putObjectAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                ACL: 'public-read',
                Key: '1.txt',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1.txt'}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.ACL = 'public-read');
                    done();
                });
            });
        });
    });
    it('putObjectAcl() header ACL:public-read-write', function (assert) {
        return new Promise(function (done) {
            cos.putObjectAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                ACL: 'public-read-write',
                Key: '1.txt',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1.txt'}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.ACL = 'public-read-write');
                    done();
                });
            });
        });
    });
    it('putObjectAcl() header GrantRead:1001,1002', function (assert) {
        return new Promise(function (done) {
            var GrantRead = 'id="qcs::cam::uin/1001:uin/1001",id="qcs::cam::uin/1002:uin/1002"';
            cos.putObjectAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                GrantRead: GrantRead,
                Key: '1.txt',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1.txt'}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.GrantRead = GrantRead);
                    done();
                });
            });
        });
    });
    it('putObjectAcl() header GrantWrite:1001,1002', function (assert) {
        return new Promise(function (done) {
            var GrantWrite = 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"';
            cos.putObjectAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                GrantWrite: GrantWrite,
                Key: '1.txt',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1.txt'}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.GrantWrite = GrantWrite);
                    done();
                });
            });
        });
    });
    it('putObjectAcl() header GrantFullControl:1001,1002', function (assert) {
        return new Promise(function (done) {
            var GrantFullControl = 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"';
            cos.putObjectAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                GrantFullControl: GrantFullControl,
                Key: '1.txt',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1.txt'}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.GrantFullControl = GrantFullControl);
                    done();
                });
            });
        });
    });
    it('putObjectAcl() header ACL:public-read, GrantRead:1001,1002', function (assert) {
        return new Promise(function (done) {
            var GrantFullControl = 'id="qcs::cam::uin/1001:uin/1001", id="qcs::cam::uin/1002:uin/1002"';
            cos.putObjectAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                GrantFullControl: GrantFullControl,
                ACL: 'public-read',
                Key: '1.txt',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({Bucket: config.Bucket, Region: config.Region, Key: '1.txt'}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.GrantFullControl = GrantFullControl);
                    assert.ok(data.ACL = 'public-read');
                    done();
                });
            });
        });
    });
    it('putObjectAcl() xml', function (assert) {
        return new Promise(function (done) {
            cos.putObjectAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                AccessControlPolicy: AccessControlPolicy,
                Key: '1.txt',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getBucketAcl({Bucket: config.Bucket, Region: config.Region, Key: '1.txt'}, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.Grants.length === 1);
                    assert.ok(data.Grants[0] && data.Grants[0].Grantee.ID === 'qcs::cam::uin/10002:uin/10002', '设置 AccessControlPolicy ID 正确');
                    assert.ok(data.Grants[0] && data.Grants[0].Permission === 'READ', '设置 AccessControlPolicy Permission 正确');
                    done();
                });
            });
        });
    });
    it('putObjectAcl() xml2', function (assert) {
        return new Promise(function (done) {
            cos.putObjectAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                AccessControlPolicy: AccessControlPolicy2,
                Key: '1.txt',
            }, function (err, data) {
                assert.ok(!err, 'putObjectAcl 成功');
                cos.getObjectAcl({
                    Bucket: config.Bucket,
                    Region: config.Region,
                    Key: '1.txt'
                }, function (err, data) { // Bucket 格式：test-1250000000
                    assert.ok(data.Grants.length === 1);
                    assert.ok(data.Grants[0] && data.Grants[0].Grantee.ID === 'qcs::cam::uin/10002:uin/10002', 'ID 正确');
                    assert.ok(data.Grants[0] && data.Grants[0].Permission === 'READ', 'Permission 正确');
                    done();
                });
            });
        });
    });
    it('putObjectAcl() decodeAcl', function (assert) {
        return new Promise(function (done) {
            cos.getObjectAcl({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                Key: '1.txt'
            }, function (err, data) {
                cos.putObjectAcl({
                    Bucket: config.Bucket, // Bucket 格式：test-1250000000
                    Region: config.Region,
                    Key: '1.txt',
                    GrantFullControl: data.GrantFullControl,
                    GrantWrite: data.GrantWrite,
                    GrantRead: data.GrantRead,
                    ACL: data.ACL,
                }, function (err, data) {
                    assert.ok(data);
                    done();
                });
            });
        });
    });
})();

(function () {
    var CORSRules = [{
        "AllowedOrigins": ["*"],
        "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": "5"
    }];
    var CORSRulesMulti = [{
        "AllowedOrigins": ["*"],
        "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": "5"
    }, {
        "AllowedOrigins": ["http://qq.com", "http://qcloud.com"],
        "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": "5"
    }];
    it('putBucketCors(),getBucketCors()', function (assert) {
        return new Promise(function (done) {
            CORSRules[0].AllowedHeaders.push('test-' + Date.now().toString(36));
            cos.putBucketCors({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                CORSConfiguration: {
                    CORSRules: CORSRules
                }
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketCors({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(CORSRules, data.CORSRules));
                        done();
                    });
                }, 2000);
            });
        });
    });
    it('putBucketCors() old', function (assert) {
        return new Promise(function (done) {
            CORSRules[0].AllowedHeaders.push('test-' + Date.now().toString(36));
            cos.putBucketCors({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                CORSConfiguration: {
                    CORSRules: CORSRules
                }
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketCors({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(CORSRules, data.CORSRules));
                        done();
                    });
                }, 2000);
            });
        });
    });
    it('putBucketCors() multi', function (assert) {
        return new Promise(function (done) {
            cos.putBucketCors({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                CORSConfiguration: {
                    CORSRules: CORSRulesMulti
                }
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketCors({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(CORSRulesMulti, data.CORSRules));
                        done();
                    });
                }, 2000);
            });
        });
    });
})();

(function () {
    var Tags = [
        {Key: "k1", Value: "v1"}
    ];
    var TagsMulti = [
        {Key: "k1", Value: "v1"},
        {Key: "k2", Value: "v2"},
    ];
    it('putBucketTagging(),getBucketTagging()', function (assert) {
        return new Promise(function (done) {
            Tags[0].Value = Date.now().toString(36);
            cos.putBucketTagging({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                Tagging: {
                    Tags: Tags
                }
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketTagging({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(Tags, data.Tags));
                        done();
                    });
                }, 1000);
            });
        });
    });
    it('deleteBucketTagging()', function (assert) {
        return new Promise(function (done) {
            cos.deleteBucketTagging({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketTagging({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject([], data.Tags));
                        done();
                    });
                }, 1000);
            });
        });
    });
    it('putBucketTagging() multi', function (assert) {
        return new Promise(function (done) {
            Tags[0].Value = Date.now().toString(36);
            cos.putBucketTagging({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                Tagging: {
                    Tags: TagsMulti
                }
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketTagging({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(TagsMulti, data.Tags));
                        done();
                    });
                }, 2000);
            });
        });
    });
})();

(function () {
    var Prefix = Date.now().toString(36);
    var Policy = {
        "version": "2.0",
        "principal": {"qcs": ["qcs::cam::uin/10001:uin/10001"]}, // 这里的 10001 是 QQ 号
        "statement": [{
            "effect": "allow",
            "action": [
                "name/cos:GetBucket",
                "name/cos:PutObject",
                "name/cos:PostObject",
                "name/cos:PutObjectCopy",
                "name/cos:InitiateMultipartUpload",
                "name/cos:UploadPart",
                "name/cos:UploadPartCopy",
                "name/cos:CompleteMultipartUpload",
                "name/cos:AbortMultipartUpload",
                "name/cos:AppendObject"
            ],
            "resource": ["qcs::cos:" + config.Region + ":uid/" + AppId + ":" + BucketLongName + ".cos." + config.Region + ".myqcloud.com//" + AppId + "/" + BucketShortName + "/" + Prefix + "/*"] // 1250000000 是 appid
        }]
    };
    it('putBucketPolicy(),getBucketPolicy()', function (assert) {
        return new Promise(function (done) {
            cos.putBucketPolicy({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                Policy: Policy
            }, function (err, data) {
                assert.ok(!err);
                cos.getBucketPolicy({
                    Bucket: config.Bucket, // Bucket 格式：test-1250000000
                    Region: config.Region
                }, function (err, data) {
                    assert.ok(Policy, data.Policy);
                    done();
                });
            });
        });
    });
    it('putBucketPolicy() s3', function (assert) {
        return new Promise(function (done) {
            cos.putBucketPolicy({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                Policy: JSON.stringify(Policy)
            }, function (err, data) {
                assert.ok(!err);
                cos.getBucketPolicy({
                    Bucket: config.Bucket, // Bucket 格式：test-1250000000
                    Region: config.Region
                }, function (err, data) {
                    assert.ok(Policy, data.Policy);
                    done();
                });
            });
        });
    });
})();

it('getBucketLocation()', function (assert) {
    return new Promise(function (done) {
        cos.getBucketLocation({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region
        }, function (err, data) {
            var map1 = {
                'tianjin': 'ap-beijing-1',
                'cn-south-2': 'ap-guangzhou-2',
                'cn-south': 'ap-guangzhou',
                'cn-east': 'ap-shanghai',
                'cn-southwest': 'ap-chengdu',
            };
            var map2 = {
                'ap-beijing-1': 'tianjin',
                'ap-guangzhou-2': 'cn-south-2',
                'ap-guangzhou': 'cn-south',
                'ap-shanghai': 'cn-east',
                'ap-chengdu': 'cn-southwest',
            };
            assert.ok(data.LocationConstraint === config.Region || data.LocationConstraint === map1[config.Region] ||
                data.LocationConstraint === map2[config.Region]);
            done();
        });
    });
});

(function () {
    var Rules = [{
        'ID': '1',
        'Filter': {
            'Prefix': 'test_' + Date.now().toString(36),
        },
        'Status': 'Enabled',
        'Transition': {
            'Date': '2018-07-29T16:00:00.000Z',
            'StorageClass': 'STANDARD_IA'
        }
    }];
    var RulesMulti = [{
        'ID': '1',
        'Filter': {
            'Prefix': 'test1_' + Date.now().toString(36),
        },
        'Status': 'Enabled',
        'Transition': {
            'Date': '2018-07-29T16:00:00.000Z',
            'StorageClass': 'STANDARD_IA'
        }
    }, {
        'ID': '2',
        'Filter': {
            'Prefix': 'test2_' + Date.now().toString(36),
        },
        'Status': 'Enabled',
        'Transition': {
            'Date': '2018-07-29T16:00:00.000Z',
            'StorageClass': 'STANDARD_IA'
        }
    }];
    it('deleteBucketLifecycle()', function (assert) {
        return new Promise(function (done) {
            cos.deleteBucketLifecycle({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketLifecycle({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject([], data.Rules));
                        done();
                    });
                }, 2000);
            });
        });
    });
    it('putBucketLifecycle(),getBucketLifecycle()', function (assert) {
        return new Promise(function (done) {
            Rules[0].Filter.Prefix = 'test_' + Date.now().toString(36);
            cos.putBucketLifecycle({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                LifecycleConfiguration: {
                    Rules: Rules
                }
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketLifecycle({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(Rules, data && data.Rules));
                        done();
                    });
                }, 2000);
            });
        });
    });
    it('putBucketLifecycle() multi', function (assert) {
        return new Promise(function (done) {
            Rules[0].Filter.Prefix = 'test_' + Date.now().toString(36);
            cos.putBucketLifecycle({
                Bucket: config.Bucket, // Bucket 格式：test-1250000000
                Region: config.Region,
                LifecycleConfiguration: {
                    Rules: RulesMulti
                }
            }, function (err, data) {
                assert.ok(!err);
                setTimeout(function () {
                    cos.getBucketLifecycle({
                        Bucket: config.Bucket, // Bucket 格式：test-1250000000
                        Region: config.Region
                    }, function (err, data) {
                        assert.ok(comparePlainObject(RulesMulti, data.Rules));
                        done();
                    });
                }, 2000);
            });
        });
    });
})();

it('params check', function (assert) {
    return new Promise(function (done) {
        cos.headBucket({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: 'gz'
        }, function (err, data) {
            assert.ok(err.error.indexOf('Region format error') === 0);
            done();
        });
    });
});

it('params check', function (assert) {
    return new Promise(function (done) {
        cos.headBucket({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: 'cos.ap-guangzhou'
        }, function (err, data) {
            assert.ok(err.error === 'Region should not be start with "cos."');
            done();
        });
    });
});
