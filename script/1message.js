/* global $, _, s, window, singleMessage:true */
/* global phiQ, phiTitle, phiBar, setup, JAM, beforeSpace, FidoHTML, fiunis */
/* global generateAreaURL */
/* will be used: GUI, nwClipboard */

singleMessage = function(echotag, parsedURL){ /* jshint indent:false */

var echobase;

var lcEchotag = echotag.toLowerCase();
var echoNames = setup.areas.group('EchoArea').names();
var foundNames = echoNames.filter(
   echoName => echoName.toLowerCase() === lcEchotag
);

if( foundNames.length === 0 ) return phiBar.reportErrorHTML(
   `Sorry, the echomail area <b>${echotag}</b> is not found on the system.`
);

var setupEchotag = foundNames[0];
var echoPath = beforeSpace(
   setup.areas.group('EchoArea').first(setupEchotag)
);
if( echoPath.toLowerCase() === 'passthrough' ) return phiBar.reportErrorHTML(
   `Sorry, the echomail area <b>${echotag}</b> is passthrough.`
);
echobase = JAM( echoPath );

var arrDesc = /-d "([^"]+?)"/.exec(
   setup.areas.group('EchoArea').first(setupEchotag)
);
var echoDesc;
if( arrDesc === null ){
   echoDesc = setupEchotag;
   phiTitle(echotag + ' - message');
} else {
   echoDesc = arrDesc[1];
   phiTitle(echoDesc + ' [' + echotag + '] messages');
}

var arrMSGID = parsedURL.optionalParams.filter(
   param => param.name === 'msgid'
).map(param => param.value);

var outputMessageText = ($message, header, callback) => {
   echobase.decodeMessage(header, (error, messageText) => {
      var $messageText = $message.find('.messageText');
      if( error ){
         $messageText.html( _.escape('' + error) );
         return callback();
      }
      $messageText.html(
         FidoHTML.fromText(messageText)
      ).find('img').each(function(){ // possible TODO: image filtering
         var $this = $(this);
         $this.attr('src', $this.data('src'));
      });
      if( setup.viewKludges ){
         $messageText.prepend(
            '<div class="kludges">' +
            FidoHTML.fromText(
               echobase.decodeKludges(header).split('\n').map(
                  kludge => '\u263A' + kludge
               ).join('\n')
            ) +
            '</p>'
         );
      }
      callback();
   });
};

var outputMessageAvatarAndOrigin = function(
   $message, header, defaultAvatarSize, callback
){
   echobase.getOrigAddr(header, function(err, origAddr){
      if( err ){
         $message.find('.origAddr').html('ERROR');
         origAddr = void 0;
      } else {
         var origAddrHTML = _.escape(origAddr);
         if( setup.nodelist !== null ){
            var nodeAddr = origAddr;
            if( nodeAddr.includes('.') ){
               nodeAddr = nodeAddr.slice( 0, nodeAddr.indexOf('.') );
            }
            var fields = setup.nodelist.getFieldsForAddr(nodeAddr);
            if( fields !== null ){
               origAddrHTML += ' (' + _.escape(fields.location) + ')';
            }
         }
         $message.find('.origAddr').html(origAddrHTML);
      }

      $message.find('.avatar').each(function(){
         /* jshint bitwise: false */
         var $avatar = $(this);

         var avatarSize;
         var height = $avatar.height();
         if ( height + 1 < defaultAvatarSize ){
            avatarSize = height + 1;
         } else {
            avatarSize = defaultAvatarSize;
         }
         $avatar.find('div').width( avatarSize );

         // before this, `avatarSize` is DOM-dimensional;
         // now it becomes pixel-dimesional (for gravatar URLs):
         if( window.devicePixelRatio ){
            avatarSize = (avatarSize * window.devicePixelRatio) |0;
         }

         var avatars = echobase.getAvatarsForHeader(
            header, ['https', 'http'], {
               size: avatarSize,
               origAddr: origAddr
         });
         if( avatars.length < 1 ) avatars = [
            'https://secure.gravatar.com/avatar/?f=y&d=mm&s=' + avatarSize
         ];

         $avatar.css('background-image', 'url(' + avatars[0] + ')');
      });

      callback();
   });
};

var outputMessageRelations = ($message, header, callback) => {
   echobase.getParentNumber(header.MessageIndex, (err, parentNum) => {
      if( err ) parentNum = 'ERROR';
      if( parentNum !== null ){
         $message.find('.messageRelations .parent').html(
            '<span class="label label-primary">Parent:</span> ' +
            `<span class="relNumber">${parentNum}</span> `
         );
         $message.find('.messageRelations').show();
      }
      echobase.getNextChildNumber(header.MessageIndex, (err, ncNum) => {
         if( err ) ncNum = 'ERROR';
         if( ncNum !== null ){
            $message.find('.messageRelations .nextSibling').html([
               ' <span class="label label-primary">Next sibling:</span> ',
               '<span class="relNumber">',
               ncNum,
               '</span>'
            ].join(''));
            $message.find('.messageRelations').show();
         }
         echobase.getChildrenNumbers(
            header.MessageIndex,
            (err, arrChildrenNum) => {
               if( err ) arrChildrenNum = ['ERROR'];
               if( arrChildrenNum.length > 0 ){
                  $message.find('.messageRelations .children').html([
                     ' <span class="label label-primary">Children:</span> ',
                     '<span class="relNumber">',
                     arrChildrenNum.join('</span>, <span class="relNumber">'),
                     '</span> '
                  ].join(''));
                  $message.find('.messageRelations').show();
               }

               $message.find('.relNumber').each(function(){
                  /* jshint bitwise: false */
                  var $this = $(this);
                  var relNumber = +$this.html();

                  phiQ.push(qNext =>
                     echobase.readHeader(relNumber, (err, header) => {
                        if( err ) return qNext();

                        var msgURL = generateAreaURL(
                           echotag, echobase.decodeHeader(header)
                        );
                        $this.wrapInner(
                           `<a href="#" data-href="${msgURL}"></a>`
                        );

                        qNext();
                     })
                  );
               });

               callback();
            }
         );
      });
   });
};

var outputSingleMessage = (header, callback) => {
   var defaultAvatarSize = 140;
   var decoded = echobase.decodeHeader(header);
   header.decoded = decoded;
   var thisMessageNumber = header.MessageIndex;
   var finalMessageNumber = echobase.size();

   var disabledBecauseFirst = '';
   if( thisMessageNumber === 1 ) disabledBecauseFirst = ' disabled';
   var disabledBecauseLast = '';
   if( thisMessageNumber === finalMessageNumber ){
      disabledBecauseLast = ' disabled';
   }

   var $curr = $(['<table class="table table-bordered table-condensed">',
      '<tr>',
         '<th rowspan=4 class="avatar inverse" width=1>',
            '<div style="width: '+defaultAvatarSize+'px;">',
               '&nbsp;',
            '</div>',
         '</th>',
         '<th class="inverse">Msg</th>',
         '<td colspan=3>',
            '<div class="messageNavigation">',
               '<button type="button" class="btn btn-default btn-xs"',
                  disabledBecauseFirst,
               '>',
                  '<i class="fa fa-fast-backward"></i>',
               '</button>',
               '<button type="button" class="btn btn-default btn-xs inner"',
                  disabledBecauseFirst,
               '>',
                  '<i class="fa fa-step-backward"></i>',
               '</button>',
               '<span>',
                  thisMessageNumber + ' of ' + finalMessageNumber,
               '</span>',
               '<button type="button" class="btn btn-default btn-xs inner"',
                  disabledBecauseLast,
               '>',
                  '<i class="fa fa-step-forward"></i>',
               '</button>',
               '<button type="button" class="btn btn-default btn-xs"',
                  disabledBecauseLast,
               '>',
                  '<i class="fa fa-fast-forward"></i>',
               '</button>',
            '</div>',
            '<div class="messageRelations" style="display: none;">',
               '<span class="parent"></span>',
               '<span class="children"></span>',
               '<span class="nextSibling"></span>',
            '</div>',
         '</td>',
      '</tr>',
      '<tr>',
         '<th class="inverse">From</th>',
         '<td>',
            _.escape(decoded.from) || '',
         '</td>',
         '<td class="origAddr">',
            '<i class="fa fa-spinner fa-spin"></i>',
         '</td>',
         '<td width=1>',
            '<nobr>',
               decoded.origTime[0], '-',
               s.pad(decoded.origTime[1], 2, '0'), '-',
               s.pad(decoded.origTime[2], 2, '0'),
            ' ',
               s.pad(decoded.origTime[3], 2, '0'), ':',
               s.pad(decoded.origTime[4], 2, '0'), ':',
               s.pad(decoded.origTime[5], 2, '0'),
            '</nobr>',
         '</td>',
      '</tr>',
      '<tr>',
         '<th class="inverse">To</th>',
         '<td>' + ( _.escape(decoded.to) ||'') + '</td>',
         // decoded.toAddr is traditionally ignored outside of netmail:
         '<td></td>', //'<td>' + (decoded.toAddr ||'') + '</td>',
         '<td width=1>',
            '<nobr>',
               decoded.procTime[0], '-',
               s.pad(decoded.procTime[1], 2, '0'), '-',
               s.pad(decoded.procTime[2], 2, '0'),
            ' ',
               s.pad(decoded.procTime[3], 2, '0'), ':',
               s.pad(decoded.procTime[4], 2, '0'), ':',
               s.pad(decoded.procTime[5], 2, '0'),
            '</nobr>',
         '</td>',
      '</tr>',
      '<tr>',
         '<th class="inverse">Subj</th>',
         '<td colspan=3>',
            _.escape( fiunis.decode(decoded.subj) ) || '',
         '</td>',
      '</tr>',
      '<tr>',
         '<td colspan=5 class="messageText">',
            '<p style="text-align: center;">',
               '<i class="fa fa-spinner fa-spin"></i>',
            '</p>',
         '</td>',
      '</tr>',
   '</table>'].join('')).appendTo('#content');

   phiQ.push(
      qNext => outputMessageText($curr, header, qNext)
   ).push(
      qNext => outputMessageRelations($curr, header, qNext)
   ).push(qNext =>
      outputMessageAvatarAndOrigin($curr, header, defaultAvatarSize, qNext)
   );
   callback();
};

phiBar.loadingMsg("Looking through messages' headers…");
echobase.headersForMSGID(arrMSGID, (err, headers) => {
   if( err ) return phiBar.reportErrorHTML( _.escape('' + err) );

   $('#content').empty();
   if( headers.length < 1 ) return $('#content').html(
      'Empty! [' + arrMSGID.join(', ') + '] not found!'
   );

   headers.forEach(header => phiQ.push(
      qNext => outputSingleMessage(header, qNext)
   ));
   phiQ.start();
});

};
