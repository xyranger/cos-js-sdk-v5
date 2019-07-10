var eachLimit = function (arr, limit, iterator, callback) {
    callback = callback || function () {};
    if (!arr.length || limit <= 0) {
        return callback();
    }

    var completed = 0;
    var started = 0;
    var running = 0;

    (function replenish () {
        if (completed >= arr.length) {
            return callback();
        }

        while (running < limit && started < arr.length) {
            started += 1;
            running += 1;
            iterator(arr[started - 1], function (err) {

                if (err) {
                    callback(err);
                    callback = function () {};
                } else {
                    completed += 1;
                    running -= 1;
                    if (completed >= arr.length) {
                        callback();
                    } else {
                        replenish();
                    }
                }
            });
        }
    })();
};

var retry = function (times, iterator, callback) {
    var next = function (index) {
        iterator(function (err, data) {
            if (err && index < times) {
                next(index + 1);
            } else {
                callback(err, data);
            }
        });
    };
    if (times < 1) {
        callback();
    } else {
        next(1);
    }
};

// 重试请求，只针对 网络错误 和 5XX请求 进行重试
var retryRequest = function (times, iterator, callback) {
    var next = function (index) {
        iterator(function (err, data) {
            if (err && index < times) {

                var errorType = err.errorType, 
                    statusCode = err.statusCode + '';

                if(errorType === 'network' || (errorType === 'response' && (statusCode / 100) === 5)) {
                    next(index + 1);
                } else {
                    callback(err);
                }
            } else {
                callback(err, data);
            }
        });
    };
    if (times < 1) {
        callback();
    } else {
        next(1);
    }
};

// 用于包裹
var retryRequestWrapper = function(method) {
    return function(params, callback) {
        var self = this, ChunkRetryTimes = this.options.ChunkRetryTimes + 1;
        retryRequest(ChunkRetryTimes, function (tryCallback) {
            if(params.TaskId && self._isRunningTask && !self._isRunningTask(params.TaskId)) { 
                // 上传任务被 abort，不继续重试
            } else {
                self[method].call(self, params, tryCallback);
            }
        }, callback);
    };
}

var async = {
    eachLimit: eachLimit,
    retry: retry,
    retryRequest: retryRequest,
    retryRequestWrapper: retryRequestWrapper
};

module.exports = async;